import { MODEL_PRESETS, resolveModelPreset } from "../presets/models";
import { UnknownModelError } from "../core/exceptions";

/** Snapshot of a single cached model's metadata. */
export interface CachedModelEntry {
  /** Friendly id from the registry (e.g. `"llama-3.2-1b-int4"`). */
  id: string;
  /** Backend-specific id (e.g. WebLLM `webllmId`). */
  backendId: string;
  /** Human-readable family name. */
  family: string;
  /** Approx parameter count, e.g. `"1B"`. */
  parameters: string;
}

/** Aggregate storage usage reported by the browser. */
export interface CacheUsage {
  /** Bytes used by the entire origin's storage (not just our cache). */
  usage: number;
  /** Bytes the browser is willing to give the origin. */
  quota: number;
}

/**
 * Hooks the {@link ModelCache} uses to talk to the underlying runtime and
 * the browser. Tests inject mocks; production code leaves them undefined,
 * letting `ModelCache` resolve the real `@mlc-ai/web-llm` helpers and
 * `navigator.storage.estimate()` lazily.
 */
export interface ModelCacheOptions {
  /** Override `hasModelInCache` from the runtime. */
  hasModel?: (backendId: string) => Promise<boolean>;
  /** Override `deleteModelInCache` from the runtime. */
  deleteModel?: (backendId: string) => Promise<void>;
  /** Override `navigator.storage.estimate()`. */
  estimate?: () => Promise<CacheUsage>;
}

type WebLLMCacheModule = {
  hasModelInCache: (id: string) => Promise<boolean>;
  deleteModelInCache: (id: string) => Promise<void>;
};

let webllmCachePromise: Promise<WebLLMCacheModule> | null = null;

async function loadWebLLMCacheHelpers(): Promise<WebLLMCacheModule> {
  if (!webllmCachePromise) {
    webllmCachePromise = import("@mlc-ai/web-llm").then((m) => ({
      hasModelInCache: m.hasModelInCache,
      deleteModelInCache: m.deleteModelInCache,
    }));
  }
  return webllmCachePromise;
}

async function defaultEstimate(): Promise<CacheUsage> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return { usage: 0, quota: 0 };
  }
  const estimate = await navigator.storage.estimate();
  return {
    usage: estimate.usage ?? 0,
    quota: estimate.quota ?? 0,
  };
}

/**
 * Inspect and manage cached model weights.
 *
 * `localm-web` does not download or cache weights itself — that work is owned
 * by `@mlc-ai/web-llm`, which writes to the browser Cache API. `ModelCache`
 * is a thin wrapper that lets a consuming app surface cache state in its UI:
 * "this model is downloaded", "you have 1.4 GB cached, free up space?",
 * "clear all models on logout".
 *
 * @example
 * ```ts
 * const cache = new ModelCache();
 * if (await cache.has("llama-3.2-1b-int4")) {
 *   console.log("ready offline");
 * }
 * const cached = await cache.list();
 * await cache.delete("phi-3.5-mini-int4");
 * const usage = await cache.estimateUsage();
 * console.log(`${usage.usage} / ${usage.quota} bytes`);
 * ```
 */
export class ModelCache {
  private readonly hasModelHook: ((id: string) => Promise<boolean>) | undefined;
  private readonly deleteModelHook: ((id: string) => Promise<void>) | undefined;
  private readonly estimateHook: () => Promise<CacheUsage>;

  constructor(options: ModelCacheOptions = {}) {
    this.hasModelHook = options.hasModel;
    this.deleteModelHook = options.deleteModel;
    this.estimateHook = options.estimate ?? defaultEstimate;
  }

  /**
   * Whether the model's weights are present in the browser cache.
   *
   * @param modelId - Friendly id from the registry.
   * @throws UnknownModelError if `modelId` is not in the registry.
   */
  async has(modelId: string): Promise<boolean> {
    const backendId: string = resolveModelPreset(modelId).webllmId;
    const fn = this.hasModelHook ?? (await loadWebLLMCacheHelpers()).hasModelInCache;
    return fn(backendId);
  }

  /**
   * Delete a single model's weights from the browser cache. No-op when the
   * model is not cached.
   *
   * @param modelId - Friendly id from the registry.
   * @throws UnknownModelError if `modelId` is not in the registry.
   */
  async delete(modelId: string): Promise<void> {
    const backendId: string = resolveModelPreset(modelId).webllmId;
    const fn = this.deleteModelHook ?? (await loadWebLLMCacheHelpers()).deleteModelInCache;
    await fn(backendId);
  }

  /**
   * List the registry models that are currently cached.
   *
   * Iterates `MODEL_PRESETS` and probes each one. Only returns models known
   * to the SDK — models cached by external WebLLM calls outside our registry
   * are not included.
   *
   * @returns Empty list when nothing is cached.
   */
  async list(): Promise<CachedModelEntry[]> {
    const fn = this.hasModelHook ?? (await loadWebLLMCacheHelpers()).hasModelInCache;
    const probes = await Promise.all(
      Object.values(MODEL_PRESETS).map(async (preset) => {
        const cached: boolean = await fn(preset.webllmId);
        if (!cached) return null;
        const entry: CachedModelEntry = {
          id: preset.id,
          backendId: preset.webllmId,
          family: preset.family,
          parameters: preset.parameters,
        };
        return entry;
      })
    );
    return probes.filter((p): p is CachedModelEntry => p !== null);
  }

  /**
   * Delete every registry model from the cache. Useful for logout flows or
   * "reset" buttons. Models cached outside the registry are not touched.
   */
  async clear(): Promise<void> {
    const fn = this.deleteModelHook ?? (await loadWebLLMCacheHelpers()).deleteModelInCache;
    await Promise.all(Object.values(MODEL_PRESETS).map((p) => fn(p.webllmId)));
  }

  /**
   * Aggregate storage stats from the browser. Returned numbers cover the
   * entire origin (Cache API + IndexedDB + Service Workers + OPFS), not
   * just our model cache — use it for "you have X of Y available" hints.
   */
  async estimateUsage(): Promise<CacheUsage> {
    return this.estimateHook();
  }

  /**
   * Throw a descriptive error if the given id is not in the registry.
   * Exposed for code paths that want to validate before calling other
   * methods (those already throw on their own).
   *
   * @throws UnknownModelError
   */
  static assertKnown(modelId: string): void {
    if (!(modelId in MODEL_PRESETS)) {
      const available = Object.keys(MODEL_PRESETS).join(", ");
      throw new UnknownModelError(`Unknown model "${modelId}". Available models: ${available}.`);
    }
  }
}
