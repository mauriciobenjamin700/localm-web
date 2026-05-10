import type { Engine } from "../core/engine";
import { WebLLMEngine } from "../core/webllm-engine";
import { WorkerEngine } from "../core/worker-engine";
import { resolveModelPreset } from "../presets/models";
import { createInferenceWorker } from "../worker/create-worker";
import type { ModelPreset, ProgressCallback } from "../types";

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
   * tokenization and generation. Defaults to `false` in v0.2 (opt-in) and
   * will flip to `true` in v0.3 once the Cache API / OPFS integration
   * (also v0.2) has been validated against worker-thread storage access.
   *
   * Ignored when {@link engine} is provided.
   */
  inWorker?: boolean;
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
    const engine = options.engine ?? LMTask.defaultEngine(options);
    if (!engine.isLoaded()) {
      await engine.load(preset.webllmId, options.onProgress);
    }
    return { engine, preset };
  }

  private static defaultEngine(options: LMTaskCreateOptions): Engine {
    if (options.inWorker) {
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
