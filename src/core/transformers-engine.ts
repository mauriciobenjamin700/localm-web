import type { Engine } from "./engine";
import type { GenerationOptions, Message, ProgressCallback, Role, TokenChunk } from "../types";
import { GenerationAbortedError, ModelLoadError, ModelNotLoadedError } from "./exceptions";
import { classifyLoadPhase } from "./load-phase";

type TransformersModule = typeof import("@huggingface/transformers");
type Pipeline = Awaited<ReturnType<TransformersModule["pipeline"]>>;

let transformersModulePromise: Promise<TransformersModule> | null = null;

/**
 * Lazy import of `@huggingface/transformers`.
 *
 * The package is an **optional** peer dependency. Loading it on demand keeps
 * the WebLLM hot path free of the ~MB-sized transformers.js graph for users
 * who never trigger the fallback.
 */
async function loadTransformers(): Promise<TransformersModule> {
  if (!transformersModulePromise) {
    transformersModulePromise = import("@huggingface/transformers");
  }
  return transformersModulePromise;
}

interface SamplingKwargs {
  max_new_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  do_sample?: boolean;
}

function buildSamplingKwargs(options: GenerationOptions): SamplingKwargs {
  const kwargs: SamplingKwargs = {};
  if (options.maxTokens !== undefined) kwargs.max_new_tokens = options.maxTokens;
  if (options.temperature !== undefined) kwargs.temperature = options.temperature;
  if (options.topP !== undefined) kwargs.top_p = options.topP;
  if (options.topK !== undefined) kwargs.top_k = options.topK;
  if (options.temperature !== undefined && options.temperature > 0) {
    kwargs.do_sample = true;
  }
  return kwargs;
}

interface TransformersChatMessage {
  role: Role;
  content: string;
}

function toChatMessages(messages: Message[]): TransformersChatMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

interface TextGenerationOutputItem {
  generated_text: string | TransformersChatMessage[];
}

function lastAssistantContent(
  output: TextGenerationOutputItem | TextGenerationOutputItem[] | undefined,
  promptText: string
): string {
  const item = Array.isArray(output) ? output[0] : output;
  if (!item) return "";
  const generated = item.generated_text;
  if (typeof generated === "string") {
    return generated.startsWith(promptText) ? generated.slice(promptText.length) : generated;
  }
  if (Array.isArray(generated)) {
    for (let i = generated.length - 1; i >= 0; i -= 1) {
      const turn = generated[i];
      if (turn && turn.role === "assistant") return turn.content;
    }
  }
  return "";
}

interface AsyncQueue<T> {
  push(item: T): void;
  end(error?: Error): void;
  iterator: AsyncIterable<T>;
}

/**
 * Minimal async queue used to bridge `TextStreamer`'s push-based callback into
 * an `AsyncIterable` consumable by the SDK's streaming API.
 */
function createAsyncQueue<T>(): AsyncQueue<T> {
  const buffer: T[] = [];
  let waiters: ((value: IteratorResult<T>) => void)[] = [];
  let finished: boolean = false;
  let pendingError: Error | null = null;

  const drain = (): void => {
    while (buffer.length > 0 && waiters.length > 0) {
      const resolver = waiters.shift();
      const value = buffer.shift();
      resolver?.({ value: value as T, done: false });
    }
    if ((finished || pendingError) && waiters.length > 0) {
      const all = waiters;
      waiters = [];
      for (const w of all) {
        if (pendingError) {
          w({ value: undefined as unknown as T, done: true });
        } else {
          w({ value: undefined as unknown as T, done: true });
        }
      }
    }
  };

  return {
    push(item: T): void {
      buffer.push(item);
      drain();
    },
    end(error?: Error): void {
      finished = true;
      if (error) pendingError = error;
      drain();
    },
    iterator: {
      [Symbol.asyncIterator](): AsyncIterator<T> {
        return {
          next(): Promise<IteratorResult<T>> {
            if (buffer.length > 0) {
              return Promise.resolve({ value: buffer.shift() as T, done: false });
            }
            if (pendingError) {
              const err = pendingError;
              pendingError = null;
              return Promise.reject(err);
            }
            if (finished) {
              return Promise.resolve({ value: undefined as unknown as T, done: true });
            }
            return new Promise<IteratorResult<T>>((resolve) => waiters.push(resolve));
          },
        };
      },
    },
  };
}

/**
 * Inference engine backed by
 * [`@huggingface/transformers`](https://github.com/huggingface/transformers.js)
 * (transformers.js).
 *
 * Used by the SDK as the **fallback path** for browsers without WebGPU and as
 * an explicit alternative backend selectable via `LMTaskCreateOptions.backend`.
 * It runs ONNX models on WebGPU when available and on WASM-SIMD otherwise, so
 * a wider range of browsers can run language models with a graceful — if
 * slower — degrade.
 *
 * The package is an optional peer dependency; import it on the consumer side
 * before instantiating tasks that resolve to this backend.
 */
export class TransformersTextEngine implements Engine {
  private generator: Pipeline | null = null;
  private currentAbortController: AbortController | null = null;

  isLoaded(): boolean {
    return this.generator !== null;
  }

  async load(modelId: string, onProgress?: ProgressCallback): Promise<void> {
    const transformers = await loadTransformers();
    try {
      const generator = await transformers.pipeline("text-generation", modelId, {
        progress_callback: (report: { progress?: number; status?: string }): void => {
          const progress: number = typeof report.progress === "number" ? report.progress / 100 : 0;
          const text: string = report.status ?? "loading";
          onProgress?.({
            progress,
            text,
            loaded: 0,
            total: 0,
            phase: classifyLoadPhase(text),
          });
        },
      } as Parameters<TransformersModule["pipeline"]>[2]);
      this.generator = generator;
      onProgress?.({
        progress: 1,
        text: "Model ready.",
        loaded: 0,
        total: 0,
        phase: "ready",
      });
    } catch (err) {
      throw new ModelLoadError(`Failed to load transformers model "${modelId}".`, err);
    }
  }

  async generate(messages: Message[], options: GenerationOptions = {}): Promise<string> {
    const generator = this.requireGenerator();
    if (options.signal?.aborted) {
      throw new GenerationAbortedError("Generation aborted before start.");
    }
    const chat = toChatMessages(messages);
    try {
      const output = (await (
        generator as unknown as (
          input: TransformersChatMessage[],
          kw?: SamplingKwargs
        ) => Promise<TextGenerationOutputItem | TextGenerationOutputItem[]>
      )(chat, buildSamplingKwargs(options))) as
        | TextGenerationOutputItem
        | TextGenerationOutputItem[];
      return lastAssistantContent(output, "");
    } catch (err) {
      if (err instanceof GenerationAbortedError) throw err;
      throw new ModelLoadError("Transformers generation failed.", err);
    }
  }

  async *stream(messages: Message[], options: GenerationOptions = {}): AsyncIterable<TokenChunk> {
    const generator = this.requireGenerator();
    if (options.signal?.aborted) {
      throw new GenerationAbortedError("Generation aborted before start.");
    }
    const transformers = await loadTransformers();
    const queue = createAsyncQueue<TokenChunk>();
    let index: number = 0;
    const tokenizer = (
      generator as unknown as {
        tokenizer: ConstructorParameters<TransformersModule["TextStreamer"]>[0];
      }
    ).tokenizer;
    const streamer = new transformers.TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (text: string): void => {
        if (text) {
          queue.push({ text, index, done: false });
          index += 1;
        }
      },
    });

    const abortPromise: Promise<never> = new Promise<never>((_, reject) => {
      if (options.signal) {
        const onAbort = (): void => {
          reject(new GenerationAbortedError("Generation aborted by signal."));
        };
        options.signal.addEventListener("abort", onAbort, { once: true });
      }
    });

    const chat = toChatMessages(messages);
    const generation = (
      generator as unknown as (
        input: TransformersChatMessage[],
        kw?: SamplingKwargs & { streamer?: unknown }
      ) => Promise<TextGenerationOutputItem | TextGenerationOutputItem[]>
    )(chat, { ...buildSamplingKwargs(options), streamer })
      .then((): void => {
        queue.push({ text: "", index, done: true });
        queue.end();
      })
      .catch((err: unknown): void => {
        queue.end(err instanceof Error ? err : new Error(String(err)));
      });

    void Promise.race([generation, abortPromise]).catch((err: unknown): void => {
      if (err instanceof GenerationAbortedError) queue.end(err);
    });

    for await (const chunk of queue.iterator) {
      yield chunk;
    }
  }

  async complete(prompt: string, options: GenerationOptions = {}): Promise<string> {
    const generator = this.requireGenerator();
    if (options.signal?.aborted) {
      throw new GenerationAbortedError("Generation aborted before start.");
    }
    try {
      const output = (await (
        generator as unknown as (
          input: string,
          kw?: SamplingKwargs
        ) => Promise<TextGenerationOutputItem | TextGenerationOutputItem[]>
      )(prompt, buildSamplingKwargs(options))) as
        | TextGenerationOutputItem
        | TextGenerationOutputItem[];
      return lastAssistantContent(output, prompt);
    } catch (err) {
      if (err instanceof GenerationAbortedError) throw err;
      throw new ModelLoadError("Transformers completion failed.", err);
    }
  }

  async *streamCompletion(
    prompt: string,
    options: GenerationOptions = {}
  ): AsyncIterable<TokenChunk> {
    const generator = this.requireGenerator();
    if (options.signal?.aborted) {
      throw new GenerationAbortedError("Generation aborted before start.");
    }
    const transformers = await loadTransformers();
    const queue = createAsyncQueue<TokenChunk>();
    let index: number = 0;
    const tokenizer = (
      generator as unknown as {
        tokenizer: ConstructorParameters<TransformersModule["TextStreamer"]>[0];
      }
    ).tokenizer;
    const streamer = new transformers.TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (text: string): void => {
        if (text) {
          queue.push({ text, index, done: false });
          index += 1;
        }
      },
    });

    (
      generator as unknown as (
        input: string,
        kw?: SamplingKwargs & { streamer?: unknown }
      ) => Promise<TextGenerationOutputItem | TextGenerationOutputItem[]>
    )(prompt, { ...buildSamplingKwargs(options), streamer })
      .then((): void => {
        queue.push({ text: "", index, done: true });
        queue.end();
      })
      .catch((err: unknown): void => {
        queue.end(err instanceof Error ? err : new Error(String(err)));
      });

    if (options.signal) {
      options.signal.addEventListener(
        "abort",
        (): void => {
          queue.end(new GenerationAbortedError("Generation aborted by signal."));
        },
        { once: true }
      );
    }

    for await (const chunk of queue.iterator) {
      yield chunk;
    }
  }

  async unload(): Promise<void> {
    if (this.generator) {
      const disposable = this.generator as unknown as { dispose?: () => Promise<void> };
      if (typeof disposable.dispose === "function") {
        await disposable.dispose();
      }
      this.generator = null;
    }
    this.currentAbortController?.abort();
    this.currentAbortController = null;
  }

  private requireGenerator(): Pipeline {
    if (!this.generator) {
      throw new ModelNotLoadedError(
        "TransformersTextEngine not loaded. Call load() before generation."
      );
    }
    return this.generator;
  }
}
