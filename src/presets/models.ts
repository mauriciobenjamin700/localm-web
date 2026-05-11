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
    transformersId: "onnx-community/Phi-3.5-mini-instruct-onnx-web",
    contextWindow: 4096,
    description: "Microsoft Phi-3.5 mini, INT4 quantized for browser inference.",
  },
  "llama-3.2-1b-int4": {
    id: "llama-3.2-1b-int4",
    family: "Llama-3.2",
    parameters: "1B",
    quantization: "q4f16_1",
    webllmId: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    transformersId: "onnx-community/Llama-3.2-1B-Instruct",
    contextWindow: 4096,
    description: "Meta Llama 3.2 1B Instruct, INT4 quantized.",
  },
  "qwen2.5-1.5b-int4": {
    id: "qwen2.5-1.5b-int4",
    family: "Qwen2.5",
    parameters: "1.5B",
    quantization: "q4f16_1",
    webllmId: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    transformersId: "onnx-community/Qwen2.5-1.5B-Instruct",
    contextWindow: 4096,
    description: "Alibaba Qwen 2.5 1.5B Instruct, INT4 quantized.",
  },
  "smollm2-360m-int8": {
    id: "smollm2-360m-int8",
    family: "SmolLM2",
    parameters: "360M",
    quantization: "q8",
    webllmId: "SmolLM2-360M-Instruct-q4f16_1-MLC",
    transformersId: "HuggingFaceTB/SmolLM2-360M-Instruct",
    contextWindow: 2048,
    description:
      "HuggingFace SmolLM2 360M Instruct — smallest viable chat model, ideal for the fallback path on low-end devices.",
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

/** Curated metadata for a supported embedding model. */
export interface EmbeddingPreset {
  /** Friendly identifier (e.g. `"bge-small-en-v1.5"`). */
  id: string;
  /** Family name (e.g. `"BGE"`). */
  family: string;
  /** Embedding dimension. */
  dimension: number;
  /** Maximum input length in tokens. */
  maxTokens: number;
  /** Identifier passed to `@huggingface/transformers`. */
  transformersId: string;
  /** Approximate quantization scheme (e.g. `"fp32"`, `"int8"`). */
  quantization: string;
  /** Short human description. */
  description: string;
}

/**
 * Curated registry of supported embedding models for v0.3.
 *
 * Each entry maps a friendly id to the underlying transformers.js model id.
 */
export const EMBEDDING_PRESETS: Readonly<Record<string, EmbeddingPreset>> = Object.freeze({
  "bge-small-en-v1.5": {
    id: "bge-small-en-v1.5",
    family: "BGE",
    dimension: 384,
    maxTokens: 512,
    transformersId: "Xenova/bge-small-en-v1.5",
    quantization: "fp32",
    description: "BAAI BGE small English v1.5, 384-dim sentence embeddings.",
  },
  "bge-base-en-v1.5": {
    id: "bge-base-en-v1.5",
    family: "BGE",
    dimension: 768,
    maxTokens: 512,
    transformersId: "Xenova/bge-base-en-v1.5",
    quantization: "fp32",
    description: "BAAI BGE base English v1.5, 768-dim sentence embeddings.",
  },
});

/**
 * Resolve a friendly embedding model id to its full preset metadata.
 *
 * @param modelId - Friendly id (e.g. `"bge-small-en-v1.5"`).
 * @returns The matching preset.
 * @throws UnknownModelError if no preset matches.
 */
export function resolveEmbeddingPreset(modelId: string): EmbeddingPreset {
  const preset = EMBEDDING_PRESETS[modelId];
  if (!preset) {
    const available = Object.keys(EMBEDDING_PRESETS).join(", ");
    throw new UnknownModelError(
      `Unknown embedding model "${modelId}". Available models: ${available}.`
    );
  }
  return preset;
}

/** Return the list of supported embedding model ids. */
export function listSupportedEmbeddingModels(): string[] {
  return Object.keys(EMBEDDING_PRESETS);
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
