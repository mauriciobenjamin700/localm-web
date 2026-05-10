import type {
  GenerationOptions,
  Message,
  ProgressCallback,
  TokenChunk,
} from "../types";

/**
 * Runtime-agnostic inference contract.
 *
 * Tasks (`Chat`, future `Completion`, etc.) depend on this interface, not on
 * a concrete backend. This lets the SDK swap WebLLM for the ORT-Web fallback
 * (planned for v0.5) without touching task code.
 */
export interface Engine {
  /**
   * Load a model into the engine.
   *
   * @param modelId - Backend-specific model identifier.
   * @param onProgress - Optional callback for load progress updates.
   * @throws ModelLoadError on failure to fetch or initialize the model.
   * @throws WebGPUUnavailableError when the engine requires WebGPU but it is missing.
   */
  load(modelId: string, onProgress?: ProgressCallback): Promise<void>;

  /**
   * Generate a single non-streaming response.
   *
   * @param messages - Conversation history including the latest user turn.
   * @param options - Generation options.
   * @returns The full generated text.
   * @throws ModelNotLoadedError if called before {@link Engine.load}.
   * @throws GenerationAbortedError if `options.signal` is triggered.
   */
  generate(messages: Message[], options?: GenerationOptions): Promise<string>;

  /**
   * Generate a streaming response as an async iterable of token chunks.
   *
   * @param messages - Conversation history including the latest user turn.
   * @param options - Generation options.
   * @returns Async iterable yielding token chunks. The final chunk has `done: true`.
   * @throws ModelNotLoadedError if called before {@link Engine.load}.
   * @throws GenerationAbortedError if `options.signal` is triggered.
   */
  stream(
    messages: Message[],
    options?: GenerationOptions
  ): AsyncIterable<TokenChunk>;

  /** Release any resources held by the engine. Safe to call when not loaded. */
  unload(): Promise<void>;

  /** Whether a model is currently loaded and ready for inference. */
  isLoaded(): boolean;
}
