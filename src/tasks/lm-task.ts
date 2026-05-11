import type { Engine } from "../core/engine";
import { BackendNotAvailableError } from "../core/exceptions";
import { TransformersTextEngine } from "../core/transformers-engine";
import { WebLLMEngine } from "../core/webllm-engine";
import { WorkerEngine } from "../core/worker-engine";
import { resolveModelPreset } from "../presets/models";
import { createInferenceWorker } from "../worker/create-worker";
import type { ModelPreset, ProgressCallback } from "../types";

/**
 * Inference backend selector.
 *
 * - `"auto"` (default): pick WebLLM when WebGPU is available, fall back to
 *   the transformers.js engine otherwise.
 * - `"webllm"`: force WebLLM. Throws `WebGPUUnavailableError` on browsers
 *   without WebGPU.
 * - `"transformers"`: force the transformers.js engine. Loads from the
 *   preset's `transformersId`; throws `BackendNotAvailableError` when the
 *   preset has no `transformersId`.
 */
export type BackendChoice = "auto" | "webllm" | "transformers";

function defaultWebGPUDetector(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

/**
 * Pure backend resolver, exported for unit tests.
 *
 * @param choice - Caller's preference (`"auto"`, `"webllm"`, `"transformers"`).
 * @param preset - Resolved model preset.
 * @param webGPUAvailable - Whether WebGPU is available in the host environment.
 * @returns The concrete backend to instantiate.
 * @throws BackendNotAvailableError when the choice cannot be satisfied (e.g.
 *   `"transformers"` requested but the preset has no `transformersId`, or
 *   `"auto"` with no WebGPU and no `transformersId`).
 */
export function resolveBackend(
  choice: BackendChoice,
  preset: ModelPreset,
  webGPUAvailable: boolean
): "webllm" | "transformers" {
  if (choice === "webllm") return "webllm";
  if (choice === "transformers") {
    if (!preset.transformersId) {
      throw new BackendNotAvailableError(
        `Model "${preset.id}" has no transformersId — cannot run on the transformers.js backend.`
      );
    }
    return "transformers";
  }
  if (webGPUAvailable) return "webllm";
  if (!preset.transformersId) {
    throw new BackendNotAvailableError(
      `WebGPU is unavailable and model "${preset.id}" has no transformersId for the fallback path.`
    );
  }
  return "transformers";
}

/** Common options accepted by every task's `create()` factory. */
export interface LMTaskCreateOptions {
  /** Optional callback for model load progress updates. */
  onProgress?: ProgressCallback;
  /**
   * Override the engine used for inference. Intended for testing.
   * Production callers should let the SDK pick a backend automatically.
   */
  engine?: Engine;
  /**
   * Run inference inside a Web Worker, isolating the UI thread from
   * tokenization and generation. **Default `true` from v0.3** — the
   * `WorkerEngine` is the recommended path. Pass `false` to keep
   * inference on the main thread (useful for environments without
   * `Worker` support or when debugging the runtime directly).
   *
   * Ignored when {@link engine} is provided.
   *
   * **Note (v0.5):** the bundled worker entry only supports the WebLLM
   * backend. When `backend` resolves to `"transformers"` the worker option
   * is forced to `false` and inference runs on the main thread. A worker
   * variant for the transformers.js path is on the v0.6 roadmap.
   */
  inWorker?: boolean;
  /**
   * Inference backend selector (v0.5+). Defaults to `"auto"` which picks
   * WebLLM when WebGPU is available and the transformers.js fallback when
   * it is not. See {@link BackendChoice}.
   */
  backend?: BackendChoice;
}

/** Internal payload returned by {@link LMTask.createEngine}. */
export interface ResolvedEngine {
  engine: Engine;
  preset: ModelPreset;
}

/**
 * Base class shared by all language-model tasks (`Chat` for v0.1; `Completion`,
 * `Embeddings` and `Reranker` planned for later versions).
 *
 * The base owns:
 *   - resolving a friendly model id to a {@link ModelPreset};
 *   - selecting and loading an {@link Engine} (defaulting to WebLLM);
 *   - exposing `unload()` for cleanup.
 *
 * Subclasses add task-specific public methods (`send`, `stream`, etc.).
 */
export abstract class LMTask {
  protected constructor(
    /** Engine used for inference. */
    protected readonly engine: Engine,
    /** Resolved metadata for the loaded model. */
    public readonly preset: ModelPreset
  ) {}

  /**
   * Load a model into a backend and return the wired-up engine + preset.
   *
   * Subclasses call this from their static `create()` factories.
   *
   * @param modelId - Friendly model id from the registry.
   * @param options - Task creation options.
   */
  protected static async createEngine(
    modelId: string,
    options: LMTaskCreateOptions = {}
  ): Promise<ResolvedEngine> {
    const preset = resolveModelPreset(modelId);
    if (options.engine) {
      if (!options.engine.isLoaded()) {
        await options.engine.load(preset.webllmId, options.onProgress);
      }
      return { engine: options.engine, preset };
    }
    const choice: BackendChoice = options.backend ?? "auto";
    const resolved: "webllm" | "transformers" = resolveBackend(
      choice,
      preset,
      defaultWebGPUDetector()
    );
    const engine: Engine = LMTask.instantiateEngine(resolved, options);
    const loadId: string =
      resolved === "transformers" ? (preset.transformersId ?? "") : preset.webllmId;
    if (!engine.isLoaded()) {
      await engine.load(loadId, options.onProgress);
    }
    return { engine, preset };
  }

  private static instantiateEngine(
    resolved: "webllm" | "transformers",
    options: LMTaskCreateOptions
  ): Engine {
    if (resolved === "transformers") {
      // The bundled inference worker only supports WebLLM today, so force
      // main-thread execution when the transformers.js backend is selected.
      return new TransformersTextEngine();
    }
    const useWorker: boolean = options.inWorker ?? true;
    if (useWorker) {
      return new WorkerEngine(createInferenceWorker());
    }
    return new WebLLMEngine();
  }

  /** Release engine resources. Safe to call multiple times. */
  async unload(): Promise<void> {
    await this.engine.unload();
  }

  /** Whether the underlying engine has a loaded model. */
  isLoaded(): boolean {
    return this.engine.isLoaded();
  }
}
