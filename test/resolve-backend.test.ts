import { describe, it, expect } from "vitest";
import { resolveBackend } from "../src/tasks/lm-task";
import { BackendNotAvailableError } from "../src/core/exceptions";
import type { ModelPreset } from "../src/types";

const dualPreset: ModelPreset = {
  id: "phi-3.5-mini-int4",
  family: "Phi-3.5",
  parameters: "3.8B",
  quantization: "q4f16_1",
  webllmId: "Phi-3.5-mini-instruct-q4f16_1-MLC",
  transformersId: "onnx-community/Phi-3.5-mini-instruct-onnx-web",
  contextWindow: 4096,
  description: "dual",
};

const webllmOnlyPreset: ModelPreset = {
  id: "webllm-only",
  family: "X",
  parameters: "1B",
  quantization: "q4",
  webllmId: "Whatever-q4f16_1-MLC",
  contextWindow: 2048,
  description: "no transformersId",
};

describe("resolveBackend", () => {
  it("forces webllm when caller asks for it", () => {
    expect(resolveBackend("webllm", dualPreset, false)).toBe("webllm");
    expect(resolveBackend("webllm", dualPreset, true)).toBe("webllm");
    expect(resolveBackend("webllm", webllmOnlyPreset, false)).toBe("webllm");
  });

  it("forces transformers when caller asks for it and preset supports it", () => {
    expect(resolveBackend("transformers", dualPreset, true)).toBe("transformers");
    expect(resolveBackend("transformers", dualPreset, false)).toBe("transformers");
  });

  it("throws BackendNotAvailableError when transformers is forced but preset has no transformersId", () => {
    expect(() => resolveBackend("transformers", webllmOnlyPreset, true)).toThrow(
      BackendNotAvailableError
    );
  });

  describe("auto", () => {
    it("picks webllm when WebGPU is available", () => {
      expect(resolveBackend("auto", dualPreset, true)).toBe("webllm");
      expect(resolveBackend("auto", webllmOnlyPreset, true)).toBe("webllm");
    });

    it("picks transformers when WebGPU is missing but transformersId exists", () => {
      expect(resolveBackend("auto", dualPreset, false)).toBe("transformers");
    });

    it("throws BackendNotAvailableError when WebGPU is missing and no transformersId", () => {
      expect(() => resolveBackend("auto", webllmOnlyPreset, false)).toThrow(
        BackendNotAvailableError
      );
    });
  });
});
