/// <reference lib="webworker" />

import { WebLLMEngine } from "../core/webllm-engine";
import type { WorkerRequest, WorkerResponse } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

const engine: WebLLMEngine = new WebLLMEngine();
const aborts: Map<number, AbortController> = new Map();

function reply(message: WorkerResponse): void {
  self.postMessage(message);
}

function fail(id: number, err: unknown): void {
  const error = err instanceof Error ? err : new Error(String(err));
  reply({ op: "error", id, name: error.name, message: error.message });
}

async function handleLoad(req: Extract<WorkerRequest, { op: "load" }>): Promise<void> {
  try {
    await engine.load(req.modelId, (payload) => {
      reply({ op: "progress", id: req.id, payload });
    });
    reply({ op: "loaded", id: req.id });
  } catch (err) {
    fail(req.id, err);
  }
}

async function handleGenerate(req: Extract<WorkerRequest, { op: "generate" }>): Promise<void> {
  const controller: AbortController = new AbortController();
  aborts.set(req.id, controller);
  try {
    const text: string = await engine.generate(req.messages, {
      ...req.options,
      signal: controller.signal,
    });
    reply({ op: "generated", id: req.id, text });
  } catch (err) {
    fail(req.id, err);
  } finally {
    aborts.delete(req.id);
  }
}

async function handleStream(req: Extract<WorkerRequest, { op: "stream" }>): Promise<void> {
  const controller: AbortController = new AbortController();
  aborts.set(req.id, controller);
  try {
    for await (const chunk of engine.stream(req.messages, {
      ...req.options,
      signal: controller.signal,
    })) {
      reply({ op: "token", id: req.id, chunk });
    }
    reply({ op: "stream-end", id: req.id });
  } catch (err) {
    fail(req.id, err);
  } finally {
    aborts.delete(req.id);
  }
}

async function handleUnload(req: Extract<WorkerRequest, { op: "unload" }>): Promise<void> {
  try {
    await engine.unload();
    reply({ op: "unloaded", id: req.id });
  } catch (err) {
    fail(req.id, err);
  }
}

function handleIsLoaded(req: Extract<WorkerRequest, { op: "isLoaded" }>): void {
  reply({ op: "is-loaded", id: req.id, value: engine.isLoaded() });
}

function handleAbort(req: Extract<WorkerRequest, { op: "abort" }>): void {
  aborts.get(req.id)?.abort();
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>): void => {
  const req = event.data;
  switch (req.op) {
    case "load":
      void handleLoad(req);
      return;
    case "generate":
      void handleGenerate(req);
      return;
    case "stream":
      void handleStream(req);
      return;
    case "unload":
      void handleUnload(req);
      return;
    case "isLoaded":
      handleIsLoaded(req);
      return;
    case "abort":
      handleAbort(req);
      return;
  }
});
