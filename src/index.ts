/**
 * localm-web — browser-only TypeScript SDK for running LLMs and SLMs locally.
 *
 * Public API surface for v0.1.
 *
 * @packageDocumentation
 */

export { Chat } from "./tasks/chat";
export { Completion } from "./tasks/completion";
export { LMTask } from "./tasks/lm-task";
export type { LMTaskCreateOptions } from "./tasks/lm-task";

export { ChatReply, CompletionResult } from "./results";

export { MODEL_PRESETS, resolveModelPreset, listSupportedModels } from "./presets/models";

export {
  LocalmWebError,
  WebGPUUnavailableError,
  ModelLoadError,
  ModelNotLoadedError,
  UnknownModelError,
  GenerationAbortedError,
  QuotaExceededError,
  BackendNotAvailableError,
} from "./core/exceptions";

export type { Engine } from "./core/engine";

export { collectStream, tap } from "./streaming/token-stream";

export type {
  Role,
  FinishReason,
  Message,
  GenerationOptions,
  ModelLoadProgress,
  ProgressCallback,
  TokenChunk,
  ModelPreset,
} from "./types";

/** Current package version. Updated at release time. */
export const VERSION: string = "0.1.0";
