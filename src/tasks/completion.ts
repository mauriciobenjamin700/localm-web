import { LMTask, type LMTaskCreateOptions } from "./lm-task";
import type { Engine } from "../core/engine";
import { CompletionResult } from "../results";
import type { GenerationOptions, ModelPreset, TokenChunk } from "../types";

/**
 * Raw text-completion task.
 *
 * Unlike {@link Chat}, `Completion` does not maintain a conversation history
 * and does not apply a chat template. The prompt is fed to the model verbatim
 * and the model continues it. Useful for "Once upon a time…" style generation,
 * code completion, or any scenario where chat formatting would interfere.
 *
 * Use {@link Completion.create} to construct an instance — the constructor is
 * private.
 *
 * @example
 * ```ts
 * const comp = await Completion.create("qwen2.5-1.5b-int4");
 * const result = await comp.predict("Once upon a time", { maxTokens: 50 });
 * console.log(result.text);
 * ```
 *
 * @example Streaming
 * ```ts
 * const controller = new AbortController();
 * for await (const token of comp.stream("def fibonacci(n):", { signal: controller.signal })) {
 *   process.stdout.write(token.text);
 * }
 * ```
 */
export class Completion extends LMTask {
  private constructor(engine: Engine, preset: ModelPreset) {
    super(engine, preset);
  }

  /**
   * Create and load a `Completion` task for the given model.
   *
   * @param modelId - Friendly model id from the registry (e.g. `"qwen2.5-1.5b-int4"`).
   * @param options - Optional creation options (progress callback, engine override).
   */
  static async create(modelId: string, options: LMTaskCreateOptions = {}): Promise<Completion> {
    const { engine, preset } = await LMTask.createEngine(modelId, options);
    return new Completion(engine, preset);
  }

  /**
   * Generate a continuation for the given prompt.
   *
   * @param prompt - Raw text fed to the model.
   * @param options - Generation options.
   * @returns A {@link CompletionResult} with the generated continuation.
   */
  async predict(prompt: string, options: GenerationOptions = {}): Promise<CompletionResult> {
    const text = await this.engine.complete(prompt, options);
    return new CompletionResult(text, prompt, 0, "stop");
  }

  /**
   * Stream a continuation for the given prompt as an async iterable of token
   * chunks.
   *
   * @param prompt - Raw text fed to the model.
   * @param options - Generation options including an optional `signal`.
   */
  async *stream(prompt: string, options: GenerationOptions = {}): AsyncIterable<TokenChunk> {
    for await (const chunk of this.engine.streamCompletion(prompt, options)) {
      yield chunk;
    }
  }
}
