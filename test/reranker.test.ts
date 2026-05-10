import { describe, it, expect } from "vitest";
import { Reranker } from "../src/tasks/reranker";
import { UnknownModelError } from "../src/core/exceptions";
import type { RerankPipeline } from "../src/tasks/reranker";

interface FakePipeline extends RerankPipeline {
  calls: Array<{ query: string; docs: string[] }>;
  unloads: number;
}

function makeFakePipeline(scoreFn: (query: string, doc: string) => number): FakePipeline {
  const pipe: FakePipeline = {
    calls: [],
    unloads: 0,
    async score(query, docs): Promise<number[]> {
      pipe.calls.push({ query, docs: [...docs] });
      return docs.map((d) => scoreFn(query, d));
    },
    async unload(): Promise<void> {
      pipe.unloads += 1;
    },
  };
  return pipe;
}

describe("Reranker", () => {
  it("create() resolves the preset and yields a ready instance", async () => {
    const pipeline = makeFakePipeline(() => 0);
    const r = await Reranker.create("bge-reranker-base", { pipeline });
    expect(r.preset.id).toBe("bge-reranker-base");
  });

  it("create() throws UnknownModelError for ids outside the registry", async () => {
    await expect(
      Reranker.create("not-real", { pipeline: makeFakePipeline(() => 0) })
    ).rejects.toBeInstanceOf(UnknownModelError);
  });

  it("score() returns one number per doc in input order", async () => {
    const pipeline = makeFakePipeline((q, d) => (d.includes(q) ? 5 : -3));
    const r = await Reranker.create("bge-reranker-base", { pipeline });
    const scores = await r.score("cat", ["the cat sleeps", "a dog barks", "cats and cats"]);
    expect(scores).toEqual([5, -3, 5]);
  });

  it("score() returns [] for empty docs without calling pipeline", async () => {
    const pipeline = makeFakePipeline(() => 1);
    const r = await Reranker.create("bge-reranker-base", { pipeline });
    expect(await r.score("q", [])).toEqual([]);
    expect(pipeline.calls).toHaveLength(0);
  });

  it("score() applies sigmoid when requested", async () => {
    const pipeline = makeFakePipeline(() => 0); // logit 0 -> sigmoid 0.5
    const r = await Reranker.create("bge-reranker-base", { pipeline });
    const scores = await r.score("q", ["a"], { sigmoid: true });
    expect(scores[0]).toBeCloseTo(0.5, 5);
  });

  it("score() returns raw logits by default (no sigmoid)", async () => {
    const pipeline = makeFakePipeline(() => 2);
    const r = await Reranker.create("bge-reranker-base", { pipeline });
    const scores = await r.score("q", ["a"]);
    expect(scores[0]).toBe(2);
  });

  it("rank() sorts by score descending and preserves original index", async () => {
    const order: Record<string, number> = { a: 1, b: 5, c: 3 };
    const pipeline = makeFakePipeline((_q, d) => order[d] ?? 0);
    const r = await Reranker.create("bge-reranker-base", { pipeline });
    const ranked = await r.rank("q", ["a", "b", "c"]);
    expect(ranked.map((rk) => rk.text)).toEqual(["b", "c", "a"]);
    expect(ranked.map((rk) => rk.index)).toEqual([1, 2, 0]);
    expect(ranked.map((rk) => rk.score)).toEqual([5, 3, 1]);
  });

  it("rank() returns [] for empty docs", async () => {
    const pipeline = makeFakePipeline(() => 1);
    const r = await Reranker.create("bge-reranker-base", { pipeline });
    expect(await r.rank("q", [])).toEqual([]);
  });

  it("unload() delegates to the pipeline", async () => {
    const pipeline = makeFakePipeline(() => 0);
    const r = await Reranker.create("bge-reranker-base", { pipeline });
    await r.unload();
    expect(pipeline.unloads).toBe(1);
  });

  it("unload() is safe when pipeline omits unload()", async () => {
    const pipeline: RerankPipeline = {
      async score(): Promise<number[]> {
        return [];
      },
    };
    const r = await Reranker.create("bge-reranker-base", { pipeline });
    await expect(r.unload()).resolves.toBeUndefined();
  });
});
