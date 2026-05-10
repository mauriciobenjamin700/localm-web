/**
 * Public type primitives for localm-web.
 */

/** Conversation roles supported by chat templates. */
export type Role = "system" | "user" | "assistant" | "tool";

/** Reason a generation loop stopped. */
export type FinishReason = "stop" | "length" | "abort";

/** A single message in a chat conversation. */
export interface Message {
  /** The role of the speaker. */
  role: Role;
  /** Text content of the message. */
  content: string;
  /** Optional name (used by some chat templates and tool calls). */
  name?: string;
}

/** Options that control a single generation call. */
export interface GenerationOptions {
  /** Maximum number of tokens to generate. Engine-default if omitted. */
  maxTokens?: number;
  /** Sampling temperature. 0 = deterministic, higher = more random. */
  temperature?: number;
  /** Top-K sampling cutoff. */
  topK?: number;
  /** Top-P (nucleus) sampling cutoff. */
  topP?: number;
  /** Cancellation signal. When triggered, the engine stops generation. */
  signal?: AbortSignal;
  /**
   * Force the engine to emit a string parseable as JSON.
   *
   * When `true` (and `jsonSchema` is not also set), the engine maps to
   * WebLLM's `response_format: { type: "json_object" }` — the model is free
   * to choose any JSON shape, but the output is guaranteed to parse.
   *
   * Ignored when {@link GenerationOptions.jsonSchema} is set.
   */
  json?: boolean;
  /**
   * JSON Schema for structured output. When set, the engine constrains
   * decoding (xgrammar inside WebLLM) so the output parses as JSON matching
   * the schema. Takes priority over {@link GenerationOptions.json}.
   *
   * The schema is passed verbatim to the runtime — the SDK does not validate
   * the parsed value against it. Use Ajv/Zod on the consumer side if you
   * need runtime validation in addition to constrained decoding.
   */
  jsonSchema?: object;
}

/**
 * Lifecycle phase of a model load.
 *
 * - `downloading`: weight files are being fetched from the network or cache.
 * - `compiling`: the runtime is preparing the model (shader compilation,
 *   tensor allocation, KV cache setup).
 * - `loading`: a generic "still working" phase reported by the runtime when
 *   it has not classified the work into download or compile.
 * - `ready`: the model is loaded and the engine is ready for inference.
 *   Emitted exactly once, at the end of a successful load.
 */
export type ModelLoadPhase = "downloading" | "compiling" | "loading" | "ready";

/** Progress event emitted while a model is loading. */
export interface ModelLoadProgress {
  /** Fraction of total work completed, in [0, 1]. */
  progress: number;
  /** Human-readable status message from the underlying runtime. */
  text: string;
  /** Bytes loaded so far. 0 when unavailable. */
  loaded: number;
  /** Total bytes to load. 0 when unavailable. */
  total: number;
  /** Lifecycle phase classified from the runtime's status text. */
  phase: ModelLoadPhase;
}

/** Callback signature for model load progress. */
export type ProgressCallback = (progress: ModelLoadProgress) => void;

/** A single token (or short span) produced by the streaming generator. */
export interface TokenChunk {
  /** Text fragment produced in this step. */
  text: string;
  /** Sequential index of this chunk in the stream, starting at 0. */
  index: number;
  /** True for the final chunk; the final chunk has empty text. */
  done: boolean;
}

/** Curated metadata for a supported model. */
export interface ModelPreset {
  /** Friendly identifier exposed to users (e.g. "phi-3.5-mini-int4"). */
  id: string;
  /** Model family (e.g. "Phi-3.5", "Llama-3.2"). */
  family: string;
  /** Parameter count as a human string (e.g. "1B", "3.8B"). */
  parameters: string;
  /** Quantization scheme (e.g. "q4f16_1"). */
  quantization: string;
  /** Identifier expected by the WebLLM runtime. */
  webllmId: string;
  /** Optional ONNX URL used by the future ORT-Web fallback (v0.5+). */
  ortUrl?: string;
  /** Maximum context window in tokens. */
  contextWindow: number;
  /** Short human description. */
  description: string;
}
