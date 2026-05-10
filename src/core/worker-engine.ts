import { GenerationAbortedError, ModelLoadError, ModelNotLoadedError } from "./exceptions";
import type { Engine } from "./engine";
import type { GenerationOptions, Message, ProgressCallback, TokenChunk } from "../types";
import {
  toSerializableOptions,
  type WorkerLike,
  type WorkerRequest,
  type WorkerResponse,
} from "../worker/protocol";

interface PendingGenerate {
  resolve: (text: string) => void;
  reject: (err: Error) => void;
}

interface PendingStream {
  push: (chunk: TokenChunk) => void;
  end: () => void;
  fail: (err: Error) => void;
}

/**
 * Engine implementation that proxies all calls to a Web Worker.
 *
 * The worker holds the actual {@link WebLLMEngine}; this class is a thin RPC
 * shell that serializes requests, tracks pending operations by a numeric id,
 * and turns worker responses back into Promises and async iterables.
 *
 * Use {@link createInferenceWorker} to obtain a real worker. Tests can pass a
 * {@link WorkerLike} mock implementing the same `postMessage` /
 * `addEventListener` surface.
 */
export class WorkerEngine implements Engine {
  private nextId: number = 1;
  private loaded: boolean = false;
  private currentLoad: { resolve: () => void; reject: (e: Error) => void } | null = null;
  private currentLoadId: number = 0;
  private currentLoadProgress: ProgressCallback | undefined = undefined;
  private currentUnload: { resolve: () => void; reject: (e: Error) => void } | null = null;
  private currentUnloadId: number = 0;
  private pendingGenerates: Map<number, PendingGenerate> = new Map();
  private pendingStreams: Map<number, PendingStream> = new Map();

  private readonly listener: (event: MessageEvent<WorkerResponse>) => void;

  constructor(private readonly worker: WorkerLike) {
    this.listener = (event): void => this.handleMessage(event.data);
    this.worker.addEventListener("message", this.listener);
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  async load(modelId: string, onProgress?: ProgressCallback): Promise<void> {
    if (this.currentLoad) {
      throw new ModelLoadError("Another load is already in progress.");
    }
    const id: number = this.allocateId();
    this.currentLoadId = id;
    this.currentLoadProgress = onProgress;
    return new Promise<void>((resolve, reject) => {
      this.currentLoad = { resolve, reject };
      this.send({ op: "load", id, modelId });
    });
  }

  async generate(messages: Message[], options: GenerationOptions = {}): Promise<string> {
    const id: number = this.allocateId();
    return new Promise<string>((resolve, reject) => {
      this.pendingGenerates.set(id, { resolve, reject });
      this.send({
        op: "generate",
        id,
        messages,
        options: toSerializableOptions(options),
      });
      options.signal?.addEventListener("abort", () => this.send({ op: "abort", id }));
    });
  }

  async *stream(messages: Message[], options: GenerationOptions = {}): AsyncIterable<TokenChunk> {
    const id: number = this.allocateId();
    const queue: TokenChunk[] = [];
    let done: boolean = false;
    let error: Error | null = null;
    let notify: (() => void) | null = null;

    const wakeup = (): void => {
      if (notify) {
        const fn = notify;
        notify = null;
        fn();
      }
    };

    this.pendingStreams.set(id, {
      push: (chunk): void => {
        queue.push(chunk);
        wakeup();
      },
      end: (): void => {
        done = true;
        wakeup();
      },
      fail: (err): void => {
        error = err;
        done = true;
        wakeup();
      },
    });

    this.send({
      op: "stream",
      id,
      messages,
      options: toSerializableOptions(options),
    });
    options.signal?.addEventListener("abort", () => this.send({ op: "abort", id }));

    try {
      while (true) {
        if (queue.length > 0) {
          const chunk = queue.shift();
          if (chunk) yield chunk;
          continue;
        }
        if (error) throw error;
        if (done) return;
        await new Promise<void>((r) => {
          notify = r;
        });
      }
    } finally {
      this.pendingStreams.delete(id);
    }
  }

  async unload(): Promise<void> {
    if (!this.loaded) return;
    if (this.currentUnload) {
      throw new ModelLoadError("Another unload is already in progress.");
    }
    const id: number = this.allocateId();
    this.currentUnloadId = id;
    return new Promise<void>((resolve, reject) => {
      this.currentUnload = { resolve, reject };
      this.send({ op: "unload", id });
    });
  }

  /** Tear down the underlying worker. The engine is unusable after this. */
  terminate(): void {
    this.worker.removeEventListener("message", this.listener);
    this.worker.terminate();
    this.loaded = false;
  }

  private allocateId(): number {
    const id = this.nextId;
    this.nextId += 1;
    return id;
  }

  private send(req: WorkerRequest): void {
    this.worker.postMessage(req);
  }

  private handleMessage(msg: WorkerResponse): void {
    switch (msg.op) {
      case "loaded":
        if (this.currentLoad && msg.id === this.currentLoadId) {
          this.loaded = true;
          this.currentLoad.resolve();
          this.currentLoad = null;
          this.currentLoadProgress = undefined;
        }
        return;
      case "progress":
        if (msg.id === this.currentLoadId) {
          this.currentLoadProgress?.(msg.payload);
        }
        return;
      case "generated": {
        const pending = this.pendingGenerates.get(msg.id);
        if (pending) {
          pending.resolve(msg.text);
          this.pendingGenerates.delete(msg.id);
        }
        return;
      }
      case "token": {
        const stream = this.pendingStreams.get(msg.id);
        stream?.push(msg.chunk);
        return;
      }
      case "stream-end": {
        const stream = this.pendingStreams.get(msg.id);
        stream?.end();
        return;
      }
      case "unloaded":
        if (this.currentUnload && msg.id === this.currentUnloadId) {
          this.loaded = false;
          this.currentUnload.resolve();
          this.currentUnload = null;
        }
        return;
      case "is-loaded":
        return;
      case "error": {
        const err = mapError(msg.name, msg.message);
        if (this.currentLoad && msg.id === this.currentLoadId) {
          this.currentLoad.reject(err);
          this.currentLoad = null;
          this.currentLoadProgress = undefined;
          return;
        }
        if (this.currentUnload && msg.id === this.currentUnloadId) {
          this.currentUnload.reject(err);
          this.currentUnload = null;
          return;
        }
        const generate = this.pendingGenerates.get(msg.id);
        if (generate) {
          generate.reject(err);
          this.pendingGenerates.delete(msg.id);
          return;
        }
        const stream = this.pendingStreams.get(msg.id);
        if (stream) {
          stream.fail(err);
          return;
        }
        return;
      }
    }
  }
}

function mapError(name: string, message: string): Error {
  switch (name) {
    case "ModelLoadError":
      return new ModelLoadError(message);
    case "ModelNotLoadedError":
      return new ModelNotLoadedError(message);
    case "GenerationAbortedError":
      return new GenerationAbortedError(message);
    default: {
      const err = new Error(message);
      err.name = name;
      return err;
    }
  }
}
