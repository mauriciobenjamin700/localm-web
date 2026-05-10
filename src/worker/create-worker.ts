import type { WorkerLike } from "./protocol";

/**
 * Spawn a new inference Web Worker.
 *
 * Uses Vite/webpack-friendly `new Worker(new URL(...), { type: "module" })`
 * syntax. The bundler emits the worker as a separate ES module chunk.
 *
 * Consumers normally do not call this directly — `LMTask.create()` invokes it
 * when `inWorker: true` is set. It is exported for advanced scenarios (custom
 * worker management, pooling, lifecycle integration with a host app).
 *
 * @returns A {@link WorkerLike}-compatible Worker instance.
 */
export function createInferenceWorker(): WorkerLike {
  return new Worker(new URL("./inference.worker.ts", import.meta.url), {
    type: "module",
  }) as unknown as WorkerLike;
}
