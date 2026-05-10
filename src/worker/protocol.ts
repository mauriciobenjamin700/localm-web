import type { GenerationOptions, Message, ModelLoadProgress, TokenChunk } from "../types";

/**
 * Subset of {@link GenerationOptions} that survives `postMessage`.
 *
 * `AbortSignal` cannot be cloned across the worker boundary, so it is replaced
 * by a separate {@link AbortRequest} message keyed on the same operation id.
 */
export type SerializableGenerationOptions = Omit<GenerationOptions, "signal">;

/** Strip `signal` from a {@link GenerationOptions} before posting it. */
export function toSerializableOptions(
  options: GenerationOptions = {}
): SerializableGenerationOptions {
  const { signal: _signal, ...rest } = options;
  void _signal;
  return rest;
}

/** Operation request sent from the main thread to the worker. */
export type WorkerRequest =
  | { op: "load"; id: number; modelId: string }
  | {
      op: "generate";
      id: number;
      messages: Message[];
      options: SerializableGenerationOptions;
    }
  | {
      op: "stream";
      id: number;
      messages: Message[];
      options: SerializableGenerationOptions;
    }
  | {
      op: "complete";
      id: number;
      prompt: string;
      options: SerializableGenerationOptions;
    }
  | {
      op: "stream-completion";
      id: number;
      prompt: string;
      options: SerializableGenerationOptions;
    }
  | { op: "abort"; id: number }
  | { op: "unload"; id: number }
  | { op: "isLoaded"; id: number };

/** Operation response sent from the worker back to the main thread. */
export type WorkerResponse =
  | { op: "loaded"; id: number }
  | { op: "generated"; id: number; text: string }
  | { op: "progress"; id: number; payload: ModelLoadProgress }
  | { op: "token"; id: number; chunk: TokenChunk }
  | { op: "stream-end"; id: number }
  | { op: "error"; id: number; name: string; message: string }
  | { op: "unloaded"; id: number }
  | { op: "is-loaded"; id: number; value: boolean };

/** Subset of `Worker` we depend on. Lets tests inject a mock. */
export interface WorkerLike {
  postMessage(message: WorkerRequest): void;
  addEventListener(type: "message", listener: (event: MessageEvent<WorkerResponse>) => void): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<WorkerResponse>) => void
  ): void;
  terminate(): void;
}

/** Internal alias used when the message direction is irrelevant (logging, debug). */
export type AbortRequest = Extract<WorkerRequest, { op: "abort" }>;
