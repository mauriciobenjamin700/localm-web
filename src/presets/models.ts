import type { ModelPreset } from "../types";
import { UnknownModelError } from "../core/exceptions";

/**
 * Curated registry of supported models for v0.1.
 *
 * Each entry maps a friendly id (e.g. `"phi-3.5-mini-int4"`) to the underlying
 * runtime identifier and metadata. Friendly ids are stable; backend ids may
 * change as upstream MLC packages evolve.
 *
 * Only models that have been validated to load in browsers with WebGPU and
 * that fit the SLM target (≤ 4B parameters at INT4) are included.
 */
export const MODEL_PRESETS: Readonly<Record<string, ModelPreset>> = Object.freeze({
  "phi-3.5-mini-int4": {
    id: "phi-3.5-mini-int4",
    family: "Phi-3.5",
    parameters: "3.8B",
    quantization: "q4f16_1",
    webllmId: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    contextWindow: 4096,
    description: "Microsoft Phi-3.5 mini, INT4 quantized for browser inference.",
  },
  "llama-3.2-1b-int4": {
    id: "llama-3.2-1b-int4",
    family: "Llama-3.2",
    parameters: "1B",
    quantization: "q4f16_1",
    webllmId: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    contextWindow: 4096,
    description: "Meta Llama 3.2 1B Instruct, INT4 quantized.",
  },
  "qwen2.5-1.5b-int4": {
    id: "qwen2.5-1.5b-int4",
    family: "Qwen2.5",
    parameters: "1.5B",
    quantization: "q4f16_1",
    webllmId: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    contextWindow: 4096,
    description: "Alibaba Qwen 2.5 1.5B Instruct, INT4 quantized.",
  },
});

/**
 * Resolve a friendly model id to its full preset metadata.
 *
 * @param modelId - Friendly id (e.g. `"phi-3.5-mini-int4"`).
 * @returns The matching preset.
 * @throws UnknownModelError if no preset matches.
 */
export function resolveModelPreset(modelId: string): ModelPreset {
  const preset = MODEL_PRESETS[modelId];
  if (!preset) {
    const available = Object.keys(MODEL_PRESETS).join(", ");
    throw new UnknownModelError(`Unknown model "${modelId}". Available models: ${available}.`);
  }
  return preset;
}

/** Return the list of supported friendly model ids. */
export function listSupportedModels(): string[] {
  return Object.keys(MODEL_PRESETS);
}

/** Curated metadata for a supported reranker (cross-encoder) model. */
export interface RerankerPreset {
  /** Friendly identifier (e.g. `"bge-reranker-base"`). */
  id: string;
  /** Family name (e.g. `"BGE Reranker"`). */
  family: string;
  /** Maximum input length in tokens (combined query + document). */
  maxTokens: number;
  /** Identifier passed to `@huggingface/transformers`. */
  transformersId: string;
  /** Approximate quantization (e.g. `"fp32"`). */
  quantization: string;
  /** Short human description. */
  description: string;
}

/**
 * Curated registry of supported reranker models for v0.3.
 */
export const RERANKER_PRESETS: Readonly<Record<string, RerankerPreset>> = Object.freeze({
  "bge-reranker-base": {
    id: "bge-reranker-base",
    family: "BGE Reranker",
    maxTokens: 512,
    transformersId: "Xenova/bge-reranker-base",
    quantization: "fp32",
    description: "BAAI BGE reranker base — multilingual cross-encoder.",
  },
});

/**
 * Resolve a friendly reranker model id to its full preset metadata.
 *
 * @param modelId - Friendly id (e.g. `"bge-reranker-base"`).
 * @throws UnknownModelError if no preset matches.
 */
export function resolveRerankerPreset(modelId: string): RerankerPreset {
  const preset = RERANKER_PRESETS[modelId];
  if (!preset) {
    const available = Object.keys(RERANKER_PRESETS).join(", ");
    throw new UnknownModelError(
      `Unknown reranker model "${modelId}". Available models: ${available}.`
    );
  }
  return preset;
}

/** Return the list of supported reranker model ids. */
export function listSupportedRerankerModels(): string[] {
  return Object.keys(RERANKER_PRESETS);
}
