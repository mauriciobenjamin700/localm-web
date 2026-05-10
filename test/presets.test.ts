import { describe, it, expect } from "vitest";
import { MODEL_PRESETS, listSupportedModels, resolveModelPreset } from "../src/presets/models";
import { UnknownModelError } from "../src/core/exceptions";

describe("MODEL_PRESETS", () => {
  it("exposes at least the 3 v0.1 models", () => {
    const ids = Object.keys(MODEL_PRESETS);
    expect(ids).toContain("phi-3.5-mini-int4");
    expect(ids).toContain("llama-3.2-1b-int4");
    expect(ids).toContain("qwen2.5-1.5b-int4");
  });

  it("each preset has all required fields", () => {
    for (const [id, preset] of Object.entries(MODEL_PRESETS)) {
      expect(preset.id).toBe(id);
      expect(preset.family).toBeTruthy();
      expect(preset.parameters).toBeTruthy();
      expect(preset.quantization).toBeTruthy();
      expect(preset.webllmId).toBeTruthy();
      expect(preset.contextWindow).toBeGreaterThan(0);
      expect(preset.description).toBeTruthy();
    }
  });

  it("is frozen at runtime", () => {
    expect(Object.isFrozen(MODEL_PRESETS)).toBe(true);
  });
});

describe("resolveModelPreset", () => {
  it("returns the matching preset for a known id", () => {
    const preset = resolveModelPreset("phi-3.5-mini-int4");
    expect(preset.family).toBe("Phi-3.5");
    expect(preset.parameters).toBe("3.8B");
  });

  it("throws UnknownModelError for an unknown id", () => {
    expect(() => resolveModelPreset("not-a-real-model")).toThrow(UnknownModelError);
  });

  it("UnknownModelError message lists available models", () => {
    try {
      resolveModelPreset("nope");
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownModelError);
      expect((err as Error).message).toContain("phi-3.5-mini-int4");
    }
  });
});

describe("listSupportedModels", () => {
  it("returns the registry keys", () => {
    expect(listSupportedModels().sort()).toEqual(Object.keys(MODEL_PRESETS).sort());
  });
});
