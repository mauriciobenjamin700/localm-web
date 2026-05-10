# Changelog

All notable changes to **localm-web** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial project scaffolding: TypeScript strict configuration, ESM-only Vite library build,
  Vitest test runner, ESLint + Prettier.
- Public type primitives: `Message`, `Role`, `FinishReason`, `GenerationOptions`,
  `ModelLoadProgress`, `ProgressCallback`, `TokenChunk`, `ModelPreset`.
- Error hierarchy rooted at `LocalmWebError` (`WebGPUUnavailableError`,
  `ModelLoadError`, `ModelNotLoadedError`, `UnknownModelError`,
  `GenerationAbortedError`, `QuotaExceededError`, `BackendNotAvailableError`).
- Runtime-agnostic `Engine` interface and concrete `WebLLMEngine` backed by `@mlc-ai/web-llm`.
- `Chat` task with `send()`, `stream()`, `setSystemPrompt()`, `resetHistory()`, `getHistory()`,
  `unload()`. Streaming honors `AbortSignal`.
- Curated model registry: `phi-3.5-mini-int4`, `llama-3.2-1b-int4`, `qwen2.5-1.5b-int4`.
- Streaming helpers: `collectStream`, `tap`.
- Vite example app under `examples/vite-chat/` demonstrating model loading,
  streaming output and abort.
- Unit tests for presets, exceptions, results, streaming and Chat (with a fake engine).

### Notes

- Pre-alpha. Public API is expected to change before v0.1.
- Project is currently hosted in the `ort-lm-sdk/` directory and will be renamed to `localm-web/`
  before publication.
