/**
 * Error hierarchy for localm-web.
 *
 * All errors thrown by the SDK extend `LocalmWebError` so consumers can
 * distinguish SDK errors from unrelated runtime errors with a single
 * `instanceof` check.
 */

/** Base class for every error raised by localm-web. */
export class LocalmWebError extends Error {
  /**
   * @param message - Human-readable description of the error.
   * @param cause - Underlying error, if any.
   */
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = new.target.name;
  }
}

/** Thrown when WebGPU is required but not available in the host browser. */
export class WebGPUUnavailableError extends LocalmWebError {}

/** Thrown when a model fails to load (network, parsing, runtime init). */
export class ModelLoadError extends LocalmWebError {}

/** Thrown when an inference call is made before a model has loaded. */
export class ModelNotLoadedError extends LocalmWebError {}

/** Thrown when a model id is not present in the curated registry. */
export class UnknownModelError extends LocalmWebError {}

/** Thrown when generation is aborted via an `AbortSignal`. */
export class GenerationAbortedError extends LocalmWebError {}

/** Thrown when the browser denies storage quota for the model cache. */
export class QuotaExceededError extends LocalmWebError {}

/** Thrown when no usable backend is available on the current platform. */
export class BackendNotAvailableError extends LocalmWebError {}
