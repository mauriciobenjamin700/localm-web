import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ModelCache } from "../src/cache/model-cache";
import { UnknownModelError } from "../src/core/exceptions";
import { MODEL_PRESETS } from "../src/presets/models";

interface FakeBackend {
  cached: Set<string>;
  hasModel: (id: string) => Promise<boolean>;
  deleteModel: (id: string) => Promise<void>;
  estimate: () => Promise<{ usage: number; quota: number }>;
}

function makeFakeBackend(seedCached: string[] = []): FakeBackend {
  const cached = new Set<string>(seedCached);
  return {
    cached,
    hasModel: async (id) => cached.has(id),
    deleteModel: async (id) => {
      cached.delete(id);
    },
    estimate: async () => ({ usage: 1024, quota: 4096 }),
  };
}

describe("ModelCache", () => {
  let backend: FakeBackend;
  let cache: ModelCache;

  beforeEach(() => {
    backend = makeFakeBackend();
    cache = new ModelCache(backend);
  });

  describe("has()", () => {
    it("returns true when the registry model is cached", async () => {
      backend.cached.add(MODEL_PRESETS["llama-3.2-1b-int4"]!.webllmId);
      expect(await cache.has("llama-3.2-1b-int4")).toBe(true);
    });

    it("returns false when the model is not cached", async () => {
      expect(await cache.has("llama-3.2-1b-int4")).toBe(false);
    });

    it("throws UnknownModelError for ids outside the registry", async () => {
      await expect(cache.has("not-a-real-model")).rejects.toBeInstanceOf(UnknownModelError);
    });

    it("resolves the friendly id to the backend webllmId before probing", async () => {
      backend.cached.add(MODEL_PRESETS["phi-3.5-mini-int4"]!.webllmId);
      // friendly id `phi-3.5-mini-int4` must map to backend id internally
      expect(await cache.has("phi-3.5-mini-int4")).toBe(true);
    });
  });

  describe("delete()", () => {
    it("removes a cached model", async () => {
      const backendId: string = MODEL_PRESETS["llama-3.2-1b-int4"]!.webllmId;
      backend.cached.add(backendId);
      await cache.delete("llama-3.2-1b-int4");
      expect(backend.cached.has(backendId)).toBe(false);
    });

    it("is a no-op when the model is not cached", async () => {
      await expect(cache.delete("llama-3.2-1b-int4")).resolves.toBeUndefined();
    });

    it("throws UnknownModelError for ids outside the registry", async () => {
      await expect(cache.delete("not-a-real-model")).rejects.toBeInstanceOf(UnknownModelError);
    });
  });

  describe("list()", () => {
    it("returns an empty array when nothing is cached", async () => {
      expect(await cache.list()).toEqual([]);
    });

    it("returns only cached registry models with full metadata", async () => {
      backend.cached.add(MODEL_PRESETS["llama-3.2-1b-int4"]!.webllmId);
      backend.cached.add(MODEL_PRESETS["qwen2.5-1.5b-int4"]!.webllmId);
      const list = await cache.list();
      expect(list).toHaveLength(2);
      const ids = list.map((e) => e.id).sort();
      expect(ids).toEqual(["llama-3.2-1b-int4", "qwen2.5-1.5b-int4"]);
      const llama = list.find((e) => e.id === "llama-3.2-1b-int4");
      expect(llama).toMatchObject({
        id: "llama-3.2-1b-int4",
        backendId: MODEL_PRESETS["llama-3.2-1b-int4"]!.webllmId,
        family: "Llama-3.2",
        parameters: "1B",
      });
    });
  });

  describe("clear()", () => {
    it("removes every registry model regardless of presence", async () => {
      backend.cached.add(MODEL_PRESETS["llama-3.2-1b-int4"]!.webllmId);
      backend.cached.add(MODEL_PRESETS["phi-3.5-mini-int4"]!.webllmId);
      await cache.clear();
      expect(backend.cached.size).toBe(0);
    });
  });

  describe("estimateUsage()", () => {
    it("forwards the injected estimate hook", async () => {
      const usage = await cache.estimateUsage();
      expect(usage).toEqual({ usage: 1024, quota: 4096 });
    });

    it("falls back to navigator.storage.estimate when no hook is injected", async () => {
      vi.stubGlobal("navigator", {
        storage: {
          estimate: async () => ({ usage: 7, quota: 99 }),
        },
      });
      const cleanCache = new ModelCache();
      const usage = await cleanCache.estimateUsage();
      expect(usage).toEqual({ usage: 7, quota: 99 });
    });

    it("falls back to zeros when navigator.storage is missing", async () => {
      vi.stubGlobal("navigator", {});
      const cleanCache = new ModelCache();
      const usage = await cleanCache.estimateUsage();
      expect(usage).toEqual({ usage: 0, quota: 0 });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });
  });

  describe("ModelCache.assertKnown()", () => {
    it("returns silently for known ids", () => {
      expect(() => ModelCache.assertKnown("llama-3.2-1b-int4")).not.toThrow();
    });

    it("throws UnknownModelError listing available ids for unknown ones", () => {
      expect(() => ModelCache.assertKnown("nope")).toThrow(UnknownModelError);
      try {
        ModelCache.assertKnown("nope");
      } catch (err) {
        expect((err as Error).message).toContain("llama-3.2-1b-int4");
      }
    });
  });
});
