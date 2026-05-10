import { ModelLoadError, ModelNotLoadedError } from "../core/exceptions";
import { resolveRerankerPreset, type RerankerPreset } from "../presets/models";
import type { ProgressCallback } from "../types";

/** Options accepted by {@link Reranker.create}. */
export interface RerankerCreateOptions {
  /** Optional callback for model load progress updates. */
  onProgress?: ProgressCallback;
  /** Override the rerank pipeline. Intended for testing. */
  pipeline?: RerankPipeline;
}

/** Options accepted by {@link Reranker.score}. */
export interface RerankOptions {
  /**
   * Apply sigmoid to logits to map scores into `[0, 1]`. Recommended when the
   * downstream code uses scores as probabilities. Default `false` (raw logits).
   */
  sigmoid?: boolean;
}

/** A document paired with its score, for {@link Reranker.rank}. */
export interface RankedDocument {
  /** The document text. */
  text: string;
  /** Score from the cross-encoder. */
  score: number;
  /** Original index of the document in the input array. */
  index: number;
}

/**
 * Minimal pipeline contract that {@link Reranker} depends on.
 *
 * The default implementation wraps `@huggingface/transformers`. Tests inject
 * a fake satisfying the same shape — they never load the real runtime.
 */
export interface RerankPipeline {
  /**
   * Score `(query, doc)` pairs. One score per doc, in the same order.
   *
   * @param query - Single query string.
   * @param docs - Documents to score against the query.
   */
  score(query: string, docs: string[]): Promise<number[]>;
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

function sigmoidValue(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

async function buildDefaultPipeline(
  preset: RerankerPreset,
  onProgress?: ProgressCallback
): Promise<RerankPipeline> {
  const transformers = await loadTransformers();
  try {
    const tokenizer = await transformers.AutoTokenizer.from_pretrained(preset.transformersId, {
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
    const model = await transformers.AutoModelForSequenceClassification.from_pretrained(
      preset.transformersId,
      {
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
      }
    );
    return {
      async score(query, docs): Promise<number[]> {
        if (docs.length === 0) return [];
        const queries: string[] = docs.map(() => query);
        // `transformers.js` AutoTokenizer accepts `(text, options)` where
        // `options.text_pair` carries the second sequence; pair-input typing
        // isn't exported, so we cast through `unknown`.
        const tokenize = tokenizer as unknown as (
          text: string[],
          options: Record<string, unknown>
        ) => Record<string, unknown>;
        const inputs = tokenize(queries, {
          text_pair: docs,
          padding: true,
          truncation: true,
          max_length: preset.maxTokens,
        });
        const callModel = model as unknown as (
          inputs: Record<string, unknown>
        ) => Promise<{ logits: { tolist: () => number[][] } }>;
        const outputs = await callModel(inputs);
        const logits: number[][] = outputs.logits.tolist();
        return logits.map((row) => row[0] ?? 0);
      },
      async unload(): Promise<void> {
        const m = model as unknown as { dispose?: () => Promise<unknown> };
        if (typeof m.dispose === "function") await m.dispose();
      },
    };
  } catch (err) {
    throw new ModelLoadError(`Failed to load reranker model "${preset.id}".`, err);
  }
}

/**
 * Cross-encoder reranking task backed by `@huggingface/transformers`.
 *
 * Use {@link Reranker.create} to construct an instance — the constructor is
 * private. Useful as a second-stage step in a retrieve-then-rerank pipeline:
 * pull top-K candidates with a fast embedding similarity, then rerank with
 * a cross-encoder for higher precision.
 *
 * @example
 * ```ts
 * const rerank = await Reranker.create("bge-reranker-base");
 * const scores = await rerank.score("what is webgpu?", [
 *   "WebGPU is a modern graphics API",
 *   "Bananas grow on trees",
 * ]);
 * // scores[0] >> scores[1]
 * ```
 *
 * @example Ranked output sorted by score
 * ```ts
 * const ranked = await rerank.rank("what is webgpu?", docs);
 * for (const r of ranked) console.log(r.score, r.text);
 * ```
 */
export class Reranker {
  private constructor(
    private readonly pipeline: RerankPipeline,
    /** Resolved metadata for the loaded model. */
    public readonly preset: RerankerPreset
  ) {}

  /**
   * Create and load a `Reranker` task for the given model.
   *
   * @param modelId - Friendly id from the reranker registry.
   * @param options - Optional creation options.
   * @throws UnknownModelError if `modelId` is not in the registry.
   * @throws ModelLoadError if the underlying pipeline fails to load.
   */
  static async create(modelId: string, options: RerankerCreateOptions = {}): Promise<Reranker> {
    const preset = resolveRerankerPreset(modelId);
    const pipeline = options.pipeline ?? (await buildDefaultPipeline(preset, options.onProgress));
    return new Reranker(pipeline, preset);
  }

  /**
   * Score each document against the query. Returns one score per doc, in
   * the same order. Empty `docs` returns `[]` (no error).
   *
   * @param query - Query string.
   * @param docs - Documents to score.
   * @param options - `sigmoid: true` maps logits into `[0, 1]`.
   */
  async score(query: string, docs: string[], options: RerankOptions = {}): Promise<number[]> {
    if (docs.length === 0) return [];
    if (!this.pipeline) {
      throw new ModelNotLoadedError("Reranker pipeline not initialized.");
    }
    const raw = await this.pipeline.score(query, docs);
    return options.sigmoid ? raw.map(sigmoidValue) : raw;
  }

  /**
   * Score and sort documents by score in descending order. Returns a list of
   * {@link RankedDocument}s carrying the original index.
   *
   * @param query - Query string.
   * @param docs - Documents to rank.
   * @param options - Forwarded to {@link Reranker.score}.
   */
  async rank(
    query: string,
    docs: string[],
    options: RerankOptions = {}
  ): Promise<RankedDocument[]> {
    const scores = await this.score(query, docs, options);
    const ranked: RankedDocument[] = scores.map((score, index) => {
      const text: string = docs[index] ?? "";
      return { text, score, index };
    });
    ranked.sort((a, b) => b.score - a.score);
    return ranked;
  }

  /** Release pipeline resources. Safe to call multiple times. */
  async unload(): Promise<void> {
    await this.pipeline.unload?.();
  }
}
