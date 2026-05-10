import { describe, it, expect } from "vitest";
import { Embeddings } from "../src/tasks/embeddings";
import { UnknownModelError, ModelLoadError } from "../src/core/exceptions";
import type { EmbedPipeline } from "../src/tasks/embeddings";

interface FakePipeline extends EmbedPipeline {
  calls: Array<{ texts: string[]; pooling: string; normalize: boolean }>;
  unloads: number;
}

function makeFakePipeline(vector: number[] = [1, 0, 0]): FakePipeline {
  const pipe: FakePipeline = {
    calls: [],
    unloads: 0,
    async embed(texts, options): Promise<number[][]> {
      pipe.calls.push({
        texts: [...texts],
        pooling: options.pooling,
        normalize: options.normalize,
      });
      return texts.map(() => vector);
    },
    async unload(): Promise<void> {
      pipe.unloads += 1;
    },
  };
  return pipe;
}

describe("Embeddings", () => {
  it("create() resolves the preset and yields a ready instance", async () => {
    const pipeline = makeFakePipeline();
    const emb = await Embeddings.create("bge-small-en-v1.5", { pipeline });
    expect(emb.preset.id).toBe("bge-small-en-v1.5");
    expect(emb.dimension).toBe(384);
  });

  it("create() throws UnknownModelError for ids outside the registry", async () => {
    await expect(
      Embeddings.create("not-a-real-model", { pipeline: makeFakePipeline() })
    ).rejects.toBeInstanceOf(UnknownModelError);
  });

  it("embed() returns one vector per input string", async () => {
    const pipeline = makeFakePipeline([0.1, 0.2, 0.3]);
    const emb = await Embeddings.create("bge-small-en-v1.5", { pipeline });
    const vectors = await emb.embed(["a", "b", "c"]);
    expect(vectors).toHaveLength(3);
    expect(vectors[0]).toEqual([0.1, 0.2, 0.3]);
  });

  it("embed() returns [] for empty input without calling the pipeline", async () => {
    const pipeline = makeFakePipeline();
    const emb = await Embeddings.create("bge-small-en-v1.5", { pipeline });
    expect(await emb.embed([])).toEqual([]);
    expect(pipeline.calls).toHaveLength(0);
  });

  it("embed() defaults to mean pooling + normalize=true", async () => {
    const pipeline = makeFakePipeline();
    const emb = await Embeddings.create("bge-small-en-v1.5", { pipeline });
    await emb.embed(["x"]);
    expect(pipeline.calls[0]).toMatchObject({ pooling: "mean", normalize: true });
  });

  it("embed() honors explicit pooling and normalize options", async () => {
    const pipeline = makeFakePipeline();
    const emb = await Embeddings.create("bge-small-en-v1.5", { pipeline });
    await emb.embed(["x"], { pooling: "cls", normalize: false });
    expect(pipeline.calls[0]).toMatchObject({ pooling: "cls", normalize: false });
  });

  it("embedSingle() unwraps the first vector", async () => {
    const pipeline = makeFakePipeline([7, 8, 9]);
    const emb = await Embeddings.create("bge-small-en-v1.5", { pipeline });
    const v = await emb.embedSingle("hello");
    expect(v).toEqual([7, 8, 9]);
  });

  it("embedSingle() throws ModelLoadError when pipeline returns no rows", async () => {
    const broken: EmbedPipeline = {
      async embed(): Promise<number[][]> {
        return [];
      },
    };
    const emb = await Embeddings.create("bge-small-en-v1.5", { pipeline: broken });
    await expect(emb.embedSingle("x")).rejects.toBeInstanceOf(ModelLoadError);
  });

  it("unload() delegates to the pipeline", async () => {
    const pipeline = makeFakePipeline();
    const emb = await Embeddings.create("bge-small-en-v1.5", { pipeline });
    await emb.unload();
    expect(pipeline.unloads).toBe(1);
  });

  it("unload() is safe when pipeline omits unload()", async () => {
    const pipeline: EmbedPipeline = {
      async embed(): Promise<number[][]> {
        return [];
      },
    };
    const emb = await Embeddings.create("bge-small-en-v1.5", { pipeline });
    await expect(emb.unload()).resolves.toBeUndefined();
  });
});
