import { describe, it, expect } from "vitest";
import {
  BackendNotAvailableError,
  GenerationAbortedError,
  LocalmWebError,
  ModelLoadError,
  ModelNotLoadedError,
  QuotaExceededError,
  UnknownModelError,
  WebGPUUnavailableError,
} from "../src/core/exceptions";

describe("error hierarchy", () => {
  const subclasses = [
    WebGPUUnavailableError,
    ModelLoadError,
    ModelNotLoadedError,
    UnknownModelError,
    GenerationAbortedError,
    QuotaExceededError,
    BackendNotAvailableError,
  ];

  it("every SDK error extends LocalmWebError", () => {
    for (const Cls of subclasses) {
      const instance = new Cls("test");
      expect(instance).toBeInstanceOf(LocalmWebError);
      expect(instance).toBeInstanceOf(Error);
    }
  });

  it("preserves the constructor name", () => {
    const instance = new ModelLoadError("boom");
    expect(instance.name).toBe("ModelLoadError");
  });

  it("captures the cause when provided", () => {
    const cause = new Error("network down");
    const instance = new ModelLoadError("load failed", cause);
    expect(instance.cause).toBe(cause);
    expect(instance.message).toBe("load failed");
  });
});
