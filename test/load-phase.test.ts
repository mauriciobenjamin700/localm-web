import { describe, it, expect } from "vitest";
import { classifyLoadPhase } from "../src/core/load-phase";

describe("classifyLoadPhase", () => {
  it("classifies download-related text as 'downloading'", () => {
    const cases: string[] = [
      "Fetching param shard 0/24",
      "Downloading model weights",
      "Loading from cache",
      "Cache hit for params.bin",
      "Param 5/24",
    ];
    for (const text of cases) {
      expect(classifyLoadPhase(text)).toBe("downloading");
    }
  });

  it("classifies compile-related text as 'compiling'", () => {
    const cases: string[] = [
      "Compiling shader programs",
      "Initializing kernel cache",
      "Allocating tensor buffers",
      "Warming up the engine",
      "Init phase 2/3",
    ];
    for (const text of cases) {
      expect(classifyLoadPhase(text)).toBe("compiling");
    }
  });

  it("falls back to 'loading' for unrecognized text", () => {
    expect(classifyLoadPhase("Reticulating splines")).toBe("loading");
    expect(classifyLoadPhase("")).toBe("loading");
    expect(classifyLoadPhase("Almost there")).toBe("loading");
  });

  it("never returns 'ready' (callers emit it explicitly)", () => {
    expect(classifyLoadPhase("ready")).toBe("loading");
    expect(classifyLoadPhase("Model ready.")).toBe("loading");
  });

  it("matches case-insensitively", () => {
    expect(classifyLoadPhase("FETCHING WEIGHTS")).toBe("downloading");
    expect(classifyLoadPhase("COMPILING")).toBe("compiling");
  });
});
