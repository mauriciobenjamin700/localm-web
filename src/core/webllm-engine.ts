import type { Engine } from "./engine";
import { classifyLoadPhase } from "./load-phase";
import type { GenerationOptions, Message, ProgressCallback, TokenChunk } from "../types";
import {
  GenerationAbortedError,
  ModelLoadError,
  ModelNotLoadedError,
  WebGPUUnavailableError,
} from "./exceptions";

type WebLLMModule = typeof import("@mlc-ai/web-llm");
type MLCEngine = import("@mlc-ai/web-llm").MLCEngineInterface;
type ChatCompletionMessageParam = import("@mlc-ai/web-llm").ChatCompletionMessageParam;

let webllmModulePromise: Promise<WebLLMModule> | null = null;

async function loadWebLLM(): Promise<WebLLMModule> {
  if (!webllmModulePromise) {
    webllmModulePromise = import("@mlc-ai/web-llm");
  }
  return webllmModulePromise;
}

function isWebGPUAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

interface SamplingParams {
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
}

function buildSamplingParams(options: GenerationOptions): SamplingParams {
  const params: SamplingParams = {};
  if (options.maxTokens !== undefined) params.max_tokens = options.maxTokens;
  if (options.temperature !== undefined) params.temperature = options.temperature;
  if (options.topP !== undefined) params.top_p = options.topP;
  return params;
}

function toChatMessages(messages: Message[]): ChatCompletionMessageParam[] {
  return messages.map((m): ChatCompletionMessageParam => {
    switch (m.role) {
      case "system":
        return { role: "system", content: m.content };
      case "user":
        return { role: "user", content: m.content };
      case "assistant":
        return { role: "assistant", content: m.content };
      case "tool":
        return { role: "tool", content: m.content, tool_call_id: m.name ?? "" };
    }
  });
}

/**
 * Inference engine backed by [WebLLM (MLC)](https://github.com/mlc-ai/web-llm).
 *
 * Requires WebGPU. The fallback path planned for v0.5 will route to ORT-Web
 * when WebGPU is missing.
 */
export class WebLLMEngine implements Engine {
  private engine: MLCEngine | null = null;

  isLoaded(): boolean {
    return this.engine !== null;
  }

  async load(modelId: string, onProgress?: ProgressCallback): Promise<void> {
    if (!isWebGPUAvailable()) {
      throw new WebGPUUnavailableError(
        "WebGPU is not available in this browser. The ORT-Web fallback is planned for v0.5."
      );
    }
    const webllm = await loadWebLLM();
    try {
      this.engine = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback: (report): void => {
          onProgress?.({
            progress: report.progress,
            text: report.text,
            loaded: 0,
            total: 0,
            phase: classifyLoadPhase(report.text),
          });
        },
      });
      onProgress?.({
        progress: 1,
        text: "Model ready.",
        loaded: 0,
        total: 0,
        phase: "ready",
      });
    } catch (err) {
      throw new ModelLoadError(`Failed to load model "${modelId}".`, err);
    }
  }

  async generate(messages: Message[], options: GenerationOptions = {}): Promise<string> {
    const engine = this.requireEngine();
    if (options.signal?.aborted) {
      throw new GenerationAbortedError("Generation aborted before start.");
    }
    const completion = await engine.chat.completions.create({
      ...buildSamplingParams(options),
      messages: toChatMessages(messages),
      stream: false,
    });
    return completion.choices[0]?.message?.content ?? "";
  }

  async *stream(messages: Message[], options: GenerationOptions = {}): AsyncIterable<TokenChunk> {
    const engine = this.requireEngine();
    if (options.signal?.aborted) {
      throw new GenerationAbortedError("Generation aborted before start.");
    }
    const completion = await engine.chat.completions.create({
      ...buildSamplingParams(options),
      messages: toChatMessages(messages),
      stream: true,
    });
    let index: number = 0;
    let finished: boolean = false;
    try {
      for await (const chunk of completion) {
        if (options.signal?.aborted) {
          throw new GenerationAbortedError("Generation aborted by signal.");
        }
        const choice = chunk.choices[0];
        const delta = choice?.delta?.content ?? "";
        if (delta) {
          yield { text: delta, index, done: false };
          index += 1;
        }
        if (choice?.finish_reason) {
          finished = true;
          yield { text: "", index, done: true };
          index += 1;
        }
      }
      if (!finished) {
        yield { text: "", index, done: true };
      }
    } catch (err) {
      if (err instanceof GenerationAbortedError) throw err;
      throw new ModelLoadError("Streaming generation failed.", err);
    }
  }

  async complete(prompt: string, options: GenerationOptions = {}): Promise<string> {
    const engine = this.requireEngine();
    if (options.signal?.aborted) {
      throw new GenerationAbortedError("Generation aborted before start.");
    }
    const completion = await engine.completions.create({
      ...buildSamplingParams(options),
      prompt,
      stream: false,
    });
    return completion.choices[0]?.text ?? "";
  }

  async *streamCompletion(
    prompt: string,
    options: GenerationOptions = {}
  ): AsyncIterable<TokenChunk> {
    const engine = this.requireEngine();
    if (options.signal?.aborted) {
      throw new GenerationAbortedError("Generation aborted before start.");
    }
    const completion = await engine.completions.create({
      ...buildSamplingParams(options),
      prompt,
      stream: true,
    });
    let index: number = 0;
    let finished: boolean = false;
    try {
      for await (const chunk of completion) {
        if (options.signal?.aborted) {
          throw new GenerationAbortedError("Generation aborted by signal.");
        }
        const choice = chunk.choices[0];
        const delta = choice?.text ?? "";
        if (delta) {
          yield { text: delta, index, done: false };
          index += 1;
        }
        if (choice?.finish_reason) {
          finished = true;
          yield { text: "", index, done: true };
          index += 1;
        }
      }
      if (!finished) {
        yield { text: "", index, done: true };
      }
    } catch (err) {
      if (err instanceof GenerationAbortedError) throw err;
      throw new ModelLoadError("Streaming completion failed.", err);
    }
  }

  async unload(): Promise<void> {
    if (this.engine) {
      await this.engine.unload();
      this.engine = null;
    }
  }

  private requireEngine(): MLCEngine {
    if (!this.engine) {
      throw new ModelNotLoadedError("Engine not loaded. Call load() before generation.");
    }
    return this.engine;
  }
}
