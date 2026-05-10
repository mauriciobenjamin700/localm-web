import { describe, it, expect } from "vitest";
import { WorkerEngine } from "../src/core/worker-engine";
import { collectStream } from "../src/streaming/token-stream";
import { GenerationAbortedError, ModelLoadError } from "../src/core/exceptions";
import type { WorkerLike, WorkerRequest, WorkerResponse } from "../src/worker/protocol";

class MockWorker implements WorkerLike {
  posted: WorkerRequest[] = [];
  terminated: boolean = false;
  private listeners: ((event: MessageEvent<WorkerResponse>) => void)[] = [];

  postMessage(message: WorkerRequest): void {
    this.posted.push(message);
  }

  addEventListener(
    _type: "message",
    listener: (event: MessageEvent<WorkerResponse>) => void
  ): void {
    this.listeners.push(listener);
  }

  removeEventListener(
    _type: "message",
    listener: (event: MessageEvent<WorkerResponse>) => void
  ): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Simulate the worker posting a response back to the main thread. */
  emit(response: WorkerResponse): void {
    const event = { data: response } as MessageEvent<WorkerResponse>;
    for (const l of this.listeners) l(event);
  }
}

describe("WorkerEngine", () => {
  it("load() resolves on a 'loaded' response and forwards progress", async () => {
    const worker = new MockWorker();
    const engine = new WorkerEngine(worker);
    const progress: number[] = [];
    const promise = engine.load("test-model", (p) => progress.push(p.progress));

    expect(worker.posted[0]).toEqual({ op: "load", id: 1, modelId: "test-model" });

    worker.emit({
      op: "progress",
      id: 1,
      payload: { progress: 0.5, text: "halfway", loaded: 0, total: 0 },
    });
    worker.emit({ op: "loaded", id: 1 });

    await promise;
    expect(engine.isLoaded()).toBe(true);
    expect(progress).toEqual([0.5]);
  });

  it("load() rejects with the mapped error on 'error' response", async () => {
    const worker = new MockWorker();
    const engine = new WorkerEngine(worker);
    const promise = engine.load("bad-model");
    worker.emit({
      op: "error",
      id: 1,
      name: "ModelLoadError",
      message: "boom",
    });
    await expect(promise).rejects.toBeInstanceOf(ModelLoadError);
  });

  it("generate() round-trips via 'generate' / 'generated'", async () => {
    const worker = new MockWorker();
    const engine = new WorkerEngine(worker);
    const promise = engine.generate([{ role: "user", content: "hi" }], { maxTokens: 10 });

    expect(worker.posted[0]).toMatchObject({
      op: "generate",
      id: 1,
      messages: [{ role: "user", content: "hi" }],
      options: { maxTokens: 10 },
    });

    worker.emit({ op: "generated", id: 1, text: "hello back" });
    await expect(promise).resolves.toBe("hello back");
  });

  it("generate() forwards an abort op when signal fires", async () => {
    const worker = new MockWorker();
    const engine = new WorkerEngine(worker);
    const controller = new AbortController();
    const promise = engine.generate([{ role: "user", content: "hi" }], {
      signal: controller.signal,
    });
    controller.abort();
    expect(worker.posted.find((m) => m.op === "abort")).toEqual({ op: "abort", id: 1 });
    worker.emit({
      op: "error",
      id: 1,
      name: "GenerationAbortedError",
      message: "aborted",
    });
    await expect(promise).rejects.toBeInstanceOf(GenerationAbortedError);
  });

  it("generate() does not post the AbortSignal across the worker boundary", async () => {
    const worker = new MockWorker();
    const engine = new WorkerEngine(worker);
    const controller = new AbortController();
    const promise = engine.generate([{ role: "user", content: "hi" }], {
      signal: controller.signal,
      maxTokens: 5,
    });
    const generateMsg = worker.posted.find((m) => m.op === "generate");
    expect(generateMsg).toBeDefined();
    if (generateMsg && generateMsg.op === "generate") {
      expect(generateMsg.options).toEqual({ maxTokens: 5 });
      expect("signal" in generateMsg.options).toBe(false);
    }
    worker.emit({ op: "generated", id: 1, text: "" });
    await promise;
  });

  it("stream() yields tokens as they arrive then completes on stream-end", async () => {
    const worker = new MockWorker();
    const engine = new WorkerEngine(worker);
    const iter = engine.stream([{ role: "user", content: "hi" }]);
    const collected: Promise<string> = collectStream(iter);

    await Promise.resolve();
    worker.emit({ op: "token", id: 1, chunk: { text: "he", index: 0, done: false } });
    worker.emit({ op: "token", id: 1, chunk: { text: "llo", index: 1, done: false } });
    worker.emit({ op: "stream-end", id: 1 });

    await expect(collected).resolves.toBe("hello");
  });

  it("stream() throws mapped error on error response", async () => {
    const worker = new MockWorker();
    const engine = new WorkerEngine(worker);
    const iter = engine.stream([{ role: "user", content: "hi" }]);
    const consumed = collectStream(iter);

    await Promise.resolve();
    worker.emit({
      op: "error",
      id: 1,
      name: "GenerationAbortedError",
      message: "aborted",
    });

    await expect(consumed).rejects.toBeInstanceOf(GenerationAbortedError);
  });

  it("unload() short-circuits when not loaded", async () => {
    const worker = new MockWorker();
    const engine = new WorkerEngine(worker);
    await engine.unload();
    expect(worker.posted).toEqual([]);
  });

  it("unload() round-trips when loaded", async () => {
    const worker = new MockWorker();
    const engine = new WorkerEngine(worker);
    const loadP = engine.load("m");
    worker.emit({ op: "loaded", id: 1 });
    await loadP;

    const unloadP = engine.unload();
    expect(worker.posted.find((m) => m.op === "unload")).toBeDefined();
    worker.emit({ op: "unloaded", id: 2 });
    await unloadP;
    expect(engine.isLoaded()).toBe(false);
  });

  it("terminate() removes listener and terminates the underlying worker", () => {
    const worker = new MockWorker();
    const engine = new WorkerEngine(worker);
    engine.terminate();
    expect(worker.terminated).toBe(true);
    expect(engine.isLoaded()).toBe(false);
  });

  it("rejects a second concurrent load", async () => {
    const worker = new MockWorker();
    const engine = new WorkerEngine(worker);
    void engine.load("a");
    await expect(engine.load("b")).rejects.toBeInstanceOf(ModelLoadError);
  });
});
