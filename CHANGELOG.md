# Changelog

All notable changes to **localm-web** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `Embeddings` task in `src/tasks/embeddings.ts` — sentence embeddings
  via `@huggingface/transformers`. `Embeddings.create(modelId, options?)`
  returns an instance; `embed(texts: string[], options?)` returns
  `number[][]`; `embedSingle(text)` returns `number[]`. Empty input
  yields `[]` (per project convention — no NotFoundError on empty).
  Default pooling `"mean"`, default `normalize: true`.
- `EMBEDDING_PRESETS` registry with `bge-small-en-v1.5` (384-dim) and
  `bge-base-en-v1.5` (768-dim). `resolveEmbeddingPreset(id)` and
  `listSupportedEmbeddingModels()` helpers.
- Public types: `EmbeddingPreset`, `EmbeddingsCreateOptions`,
  `EmbedOptions`, `EmbedPipeline` (DI hook for tests).
- `peerDependenciesMeta` marks `@huggingface/transformers` as
  optional — Chat / Completion users do not need to install it.
- 10 unit tests in `test/embeddings.test.ts` covering registry
  resolution, batch + single embedding, empty input short-circuit,
  pooling / normalize defaults and overrides, unload delegation,
  graceful unload when pipeline omits `unload()`.

## [0.2.0] - 2026-05-10

### Added

- `docs/getting-started.md` — end-to-end guide covering prerequisites,
  install, first chat snippet, the curated model registry with download /
  RAM estimates, how a model downloads and where it caches, running the
  example Vite app, cold-start expectations, inspecting / clearing the
  Cache API, offline behavior and troubleshooting.
- README links to the new guide from the **Installation** and
  **Vite usage** sections; the example app blurb now points at the
  runnable folder instead of hedging with "once v0.1 lands".
- `Completion` task for raw text continuation (no chat template, no history).
  Exposes `predict()` returning a `CompletionResult` and `stream()` yielding
  `TokenChunk` async iterable. Mirrors the `Chat` task DX.
- `CompletionResult` class in `src/results.ts` — holds the generated text,
  the original prompt, tokens generated and finish reason.
- `Engine.complete()` and `Engine.streamCompletion()` methods on the
  runtime-agnostic engine contract. `WebLLMEngine` implements both via
  `engine.completions.create()` (raw text mode, bypasses chat template).
- `ModelLoadPhase` discriminated string type
  (`"downloading" | "compiling" | "loading" | "ready"`) on `ModelLoadProgress`.
  Lets consumers drive UI state machines (spinner → progress bar → ready
  badge) without parsing the runtime's free-form status text.
- `WebLLMEngine.load()` classifies each progress report via
  `classifyLoadPhase()` and emits a final `phase: "ready"` event exactly
  once when the load resolves successfully.
- `WorkerEngine` — `Engine` implementation that proxies all calls to a Web
  Worker via a typed RPC protocol. Lets consumers run inference off the UI
  thread.
- `createInferenceWorker()` helper that spawns a module-type Worker pointing
  at the SDK's bundled worker entry. Exposed for advanced lifecycle
  scenarios (pooling, custom termination); most consumers never call it
  directly.
- `LMTaskCreateOptions.inWorker` flag (default `false` in v0.2). When
  `true`, the task instantiates a worker-backed engine instead of running
  inference on the main thread. Default flips to `true` in v0.3 once the
  Cache API / OPFS integration validates worker-thread storage access.
- `src/worker/protocol.ts` — discriminated-union message contract between
  main thread and worker (`load`, `generate`, `stream`, `complete`,
  `stream-completion`, `abort`, `unload`, `isLoaded` requests; `loaded`,
  `progress`, `generated`, `token`, `stream-end`, `error`, `unloaded`,
  `is-loaded` responses). Numeric op ids isolate concurrent operations.
- `WorkerLike` interface exported for tests and custom integrations that
  need to inject a transport (mocks, Comlink wrappers, MessagePort
  bridges).
- 11 new unit tests in `test/worker-engine.test.ts` exercising load with
  progress, generate round-trip, abort propagation, signal stripping,
  streaming queue, error mapping, unload short-circuit, terminate, and
  concurrent-load rejection.
- `ModelCache` class in `src/cache/model-cache.ts` — inspect and manage
  cached model weights from a consuming app:
  - `has(modelId)` / `delete(modelId)` wrap WebLLM's `hasModelInCache` /
    `deleteModelInCache`, validating the friendly id against the
    registry first.
  - `list()` iterates `MODEL_PRESETS` and returns the cached subset as
    `CachedModelEntry[]` with friendly id, backend id, family, params.
    Empty list when nothing is cached (per the project's
    `*NotFoundError`-free convention).
  - `clear()` deletes every registry model in parallel — useful for
    logout / reset flows.
  - `estimateUsage()` wraps `navigator.storage.estimate()` and returns
    `{ usage, quota }`. Falls back to zeros when the API is missing.
  - `ModelCache.assertKnown(modelId)` static guard that throws
    `UnknownModelError` for ids outside the registry.
- Public types: `CachedModelEntry`, `CacheUsage`, `ModelCacheOptions`
  re-exported from `src/index.ts`.
- Dependency-injectable backend (`hasModel`, `deleteModel`, `estimate`
  hooks) so unit tests can mock the runtime + browser APIs without
  touching the real Cache API or `@mlc-ai/web-llm`.
- 15 unit tests in `test/model-cache.test.ts` covering `has` / `delete`
  / `list` / `clear` / `estimateUsage` and `assertKnown`, including
  navigator fallbacks via `vi.stubGlobal`.

### Changed

- `ProgressCallback` payload shape gained a required `phase` field. This is
  technically a breaking change but the SDK is pre-1.0 and the type is
  emitted only by the engine — consumers were already supposed to treat
  the payload as opaque.
- `vite.config.ts` adds `worker.format = "es"` and externalizes ORT-Web /
  HF deps from the worker bundle. `@mlc-ai/web-llm` is intentionally
  bundled into the worker chunk because workers cannot resolve bare
  specifiers at runtime — this trades a larger lazy-loaded chunk
  (~6.5 MB pre-gzip, only fetched when `inWorker: true`) for a clean DX
  (no consumer-side worker config). The main `dist/index.js` stays at
  ~16 kB and webllm remains a peer dep there.
- `engines.node` bumped from `>=18.0.0` to `>=20.19.0`. Vite 7's worker
  bundler depends on `crypto.hash()` which lands in Node 19; Node 18
  also reaches end-of-life on 2025-04-30 per the Node release schedule.
- CI matrix dropped Node 18, kept 20 + 22.

### Notes

- `ModelCache` is **inspection + management only**. Actual weight
  download still flows through WebLLM's internal Cache-API path.
  OPFS-as-primary-storage and resume-on-interrupted-download (also in
  the v0.2 roadmap) require intercepting the WebLLM downloader and
  are deferred to v0.3 to avoid forking upstream.

## [0.1.0] - 2026-05-10

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
- Release pipeline: `Makefile` + `scripts/release.sh` (release branch + tag + PR flow,
  PT-BR PR template), `RELEASES.md` autogenerated from git tags.
- GitHub Actions workflows: `ci.yml` (Node 18/20/22 matrix) and `release-npm.yml`
  (publish on `v*.*.*` tag with `npm publish --provenance`).
- Security policy documented in `CLAUDE.md` and `README.md`: runtime vs dev-deps split,
  zero-CVE bar for `peerDependencies`, `npm audit` on every release, provenance signing.

### Changed

- Bumped `vite` from `^5.4.0` to `^7.3.3` and `vitest` from `^2.1.0` to `^3.2.4`
  to clear advisories GHSA-67mh-4wv8-2f99 (esbuild dev-server CORS) and
  GHSA-4w7w-66w2-5vf9 (vite path traversal in optimized deps `.map`).
- Added `overrides.esbuild ^0.25.0` in `package.json` as defense-in-depth against
  transitive esbuild downgrades.
- ESLint flat config: expanded `ignores` to cover config files and `examples/**`.
- `tsconfig.test.json`: explicit `exclude` so test files are picked up by the
  TypeScript-aware ESLint parser.
- `package.json` `lint` script: dropped `--ext .ts,.tsx` (no-op in flat config).

### Notes

- First public release. `Chat` task is the only fully implemented task — `Completion`,
  `Embeddings`, `Reranker`, structured output and ORT-Web fallback are scheduled for v0.2–v0.5.
