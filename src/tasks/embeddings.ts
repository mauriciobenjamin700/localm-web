import { ModelLoadError, ModelNotLoadedError } from "../core/exceptions";
import { resolveEmbeddingPreset, type EmbeddingPreset } from "../presets/models";
import type { ProgressCallback } from "../types";

/** Options accepted by {@link Embeddings.create}. */
export interface EmbeddingsCreateOptions {
  /** Optional callback for model load progress updates. */
  onProgress?: ProgressCallback;
  /** Override the embedding pipeline. Intended for testing. */
  pipeline?: EmbedPipeline;
}

/** Options accepted by {@link Embeddings.embed}. */
export interface EmbedOptions {
  /** L2-normalize each vector. Recommended for cosine similarity downstream. Default `true`. */
  normalize?: boolean;
  /** Pooling strategy. BGE-style models use `"cls"`. Most sentence-transformers use `"mean"`. Default `"mean"`. */
  pooling?: "mean" | "cls";
}

/**
 * Minimal pipeline contract that {@link Embeddings} depends on.
 *
 * The default implementation wraps `@huggingface/transformers`. Tests inject
 * a fake satisfying the same shape — they never load the real runtime.
 */
export interface EmbedPipeline {
  /**
   * Run the encoder on a batch of inputs and return raw vectors.
   *
   * @param texts - Input strings.
   * @param options - Pooling + normalization passed to the underlying pipeline.
   */
  embed(texts: string[], options: Required<EmbedOptions>): Promise<number[][]>;
  /** Release pipeline resources. */
  unload?(): Promise<void>;
}

type TransformersModule = typeof import("@huggingface/transformers");

let transformersModulePromise: Promise<TransformersModule> | null = null;

async function loadTransformers(): Promise<TransformersModule> {
  if (!transformersModulePromise) {
    transformersModulePromise = import("@huggingface/transformers");
  }
  return transformersModulePromise;
}

async function buildDefaultPipeline(
  preset: EmbeddingPreset,
  onProgress?: ProgressCallback
): Promise<EmbedPipeline> {
  const transformers = await loadTransformers();
  try {
    const pipe = await transformers.pipeline("feature-extraction", preset.transformersId, {
      progress_callback: (report: unknown): void => {
        if (!onProgress) return;
        const r = report as { progress?: number; status?: string };
        onProgress({
          progress: typeof r.progress === "number" ? r.progress / 100 : 0,
          text: r.status ?? "",
          loaded: 0,
          total: 0,
          phase: "downloading",
        });
      },
    });
    return {
      async embed(texts, options): Promise<number[][]> {
        const output = await pipe(texts, {
          pooling: options.pooling,
          normalize: options.normalize,
        });
        return output.tolist();
      },
      async unload(): Promise<void> {
        if (typeof (pipe as { dispose?: () => Promise<void> }).dispose === "function") {
          await (pipe as unknown as { dispose: () => Promise<void> }).dispose();
        }
      },
    };
  } catch (err) {
    throw new ModelLoadError(`Failed to load embedding model "${preset.id}".`, err);
  }
}

/**
 * Sentence embedding task backed by `@huggingface/transformers`.
 *
 * Use {@link Embeddings.create} to construct an instance — the constructor is
 * private. The default backend lazy-loads the transformers.js runtime; tests
 * inject a {@link EmbedPipeline} mock instead.
 *
 * @example
 * ```ts
 * const emb = await Embeddings.create("bge-small-en-v1.5");
 * const vectors = await emb.embed(["hello world", "another sentence"]);
 * console.log(vectors[0].length); // 384
 * ```
 */
export class Embeddings {
  private constructor(
    private readonly pipeline: EmbedPipeline,
    /** Resolved metadata for the loaded model. */
    public readonly preset: EmbeddingPreset
  ) {}

  /**
   * Create and load an `Embeddings` task for the given model.
   *
   * @param modelId - Friendly id from the embedding registry.
   * @param options - Optional creation options.
   * @throws UnknownModelError if `modelId` is not in the registry.
   * @throws ModelLoadError if the underlying pipeline fails to load.
   */
  static async create(modelId: string, options: EmbeddingsCreateOptions = {}): Promise<Embeddings> {
    const preset = resolveEmbeddingPreset(modelId);
    const pipeline = options.pipeline ?? (await buildDefaultPipeline(preset, options.onProgress));
    return new Embeddings(pipeline, preset);
  }

  /**
   * Encode an array of strings into dense vectors.
   *
   * Returns one vector per input, in the same order. Empty input array
   * returns an empty array (no error).
   *
   * @param texts - Input strings.
   * @param options - Pooling + normalization. Defaults: `pooling: "mean"`, `normalize: true`.
   */
  async embed(texts: string[], options: EmbedOptions = {}): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (!this.pipeline) {
      throw new ModelNotLoadedError("Embeddings pipeline not initialized.");
    }
    const merged: Required<EmbedOptions> = {
      normalize: options.normalize ?? true,
      pooling: options.pooling ?? "mean",
    };
    return this.pipeline.embed(texts, merged);
  }

  /**
   * Convenience: encode a single string and return its vector.
   *
   * @param text - Input string.
   * @param options - Forwarded to {@link Embeddings.embed}.
   */
  async embedSingle(text: string, options: EmbedOptions = {}): Promise<number[]> {
    const [vec] = await this.embed([text], options);
    if (!vec) {
      throw new ModelLoadError("Embedding pipeline returned no result.");
    }
    return vec;
  }

  /** Embedding dimension exposed by the loaded model. */
  get dimension(): number {
    return this.preset.dimension;
  }

  /** Release pipeline resources. Safe to call multiple times. */
  async unload(): Promise<void> {
    await this.pipeline.unload?.();
  }
}
