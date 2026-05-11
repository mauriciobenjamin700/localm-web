# Changelog

All notable changes to **localm-web** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0] - 2026-05-10

### Added

- **ORT-Web fallback path (v0.5)** — `TransformersTextEngine` in
  `src/core/transformers-engine.ts` implements the runtime-agnostic
  `Engine` contract on top of
  [`@huggingface/transformers`](https://github.com/huggingface/transformers.js).
  Lazy-imports the optional peer dep so the WebLLM hot path stays slim.
  Runs ONNX models on WebGPU when available and on WASM-SIMD otherwise,
  with a `TextStreamer` → async-iterable bridge for `stream()` /
  `streamCompletion()` parity with `WebLLMEngine`.
- **Backend selector + auto-routing** — new `BackendChoice` type
  (`"auto" | "webllm" | "transformers"`) on `LMTaskCreateOptions.backend`.
  `"auto"` (default) picks WebLLM when WebGPU is available and falls
  back to the transformers.js engine otherwise. `resolveBackend(choice,
preset, webGPUAvailable)` exported from the package root for unit
  tests and custom routing logic. `BackendNotAvailableError` is raised
  when no backend can satisfy the request (e.g. `"transformers"` forced
  on a preset without `transformersId`).
- `ModelPreset.transformersId?: string` — HuggingFace Hub repo id used
  by the transformers.js fallback. Replaces the unused `ortUrl` field.
- 4 presets now carry `transformersId` mappings: `phi-3.5-mini-int4`,
  `llama-3.2-1b-int4`, `qwen2.5-1.5b-int4`, and the new
  `smollm2-360m-int8` (the smallest viable chat model, intended as the
  default for low-end devices on the fallback path).
- Public exports: `TransformersTextEngine`, `WebLLMEngine`,
  `resolveBackend`, `BackendChoice`.
- 6 unit tests in `test/resolve-backend.test.ts` covering each
  combination of `BackendChoice` × WebGPU availability × preset
  capability, including the two `BackendNotAvailableError` paths.

### Changed

- **CI / dev runtime moved to Node 22 + 24.**
  - `engines.node` bumped from `>=20.19.0` to `>=22.0.0`. Node 20
    reached end-of-life on 2026-04-30 per the Node release schedule
    and the `Release to npm` workflow started warning about
    `actions/checkout@v4` / `actions/setup-node@v4` running on Node 20.
  - CI matrix in `.github/workflows/ci.yml` flipped from `["20", "22"]`
    to `["22", "24"]`.
  - Release workflow (`.github/workflows/release-npm.yml`) now sets up
    Node 22 (was 20).
  - `actions/checkout@v4` → `@v5` and `actions/setup-node@v4` → `@v5`
    in both workflows. Eliminates the Node 20 deprecation notice that
    appeared on the v0.4.0 publish run.
- `docs/getting-started.md` prerequisite row updated to reflect the
  new Node 22+ requirement.

## [0.4.0] - 2026-05-10

### Added

- **Structured output (v0.4)** — JSON mode and JSON Schema constrained
  decoding via WebLLM's `response_format` / xgrammar.
  - `GenerationOptions.json: boolean` — when `true`, the engine is forced
    to emit a string parseable as JSON (free-form shape).
    `GenerationOptions.jsonSchema?: object` — when set, takes priority
    over `json` and constrains decoding so the output matches the schema.
  - `ChatReply.json<T>()` and `CompletionResult.json<T>()` parse the
    generated text and return it cast to `T`. No runtime validation of
    the schema is performed; pair with Ajv / Zod on the call site if you
    need it.
  - `StructuredOutputError` (extends `LocalmWebError`) wraps the
    underlying `SyntaxError` from `JSON.parse`, so consumers can
    distinguish SDK-issued failures from unrelated runtime exceptions.
  - `src/structured/json-schema.ts` exposes `assertJsonSchema`,
    `serializeJsonSchema`, and `parseStructuredOutput<T>` re-exported
    from `localm-web`.
  - `WebLLMEngine.generate` / `stream` / `complete` / `streamCompletion`
    forward `response_format` to WebLLM. Worker engine inherits the
    behavior without changes (the worker protocol already passes
    `GenerationOptions` through `postMessage`; only `signal` is stripped).
- 15 unit tests in `test/structured-output.test.ts` covering schema
  assertion (accept / reject paths), schema serialization, JSON parsing
  of objects / arrays / primitives / invalid input, error chaining via
  `cause`, and the `.json()` helpers on `ChatReply` and
  `CompletionResult`.

## [0.3.0] - 2026-05-10

### Changed

- **`LMTaskCreateOptions.inWorker` default flipped from `false` to `true`.**
  `Chat.create()` and `Completion.create()` now spawn a Web Worker by
  default, isolating tokenization and WebGPU dispatches from the UI
  thread. Pass `inWorker: false` explicitly to revert to main-thread
  inference (useful in environments without `Worker` support or when
  debugging the runtime). The fast path for opting out is unchanged
  in shape — only the default differs. Pre-1.0 SDK; consumers
  upgrading from v0.2 will silently move inference off the main
  thread, which is desirable for almost every app.

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
- `Reranker` task in `src/tasks/reranker.ts` — cross-encoder reranking
  via `@huggingface/transformers`. `Reranker.create(modelId, options?)`
  returns an instance; `score(query, docs, options?)` returns
  `number[]` (raw logits, or sigmoid-mapped to `[0, 1]` when
  `sigmoid: true`); `rank(query, docs, options?)` returns
  `RankedDocument[]` sorted descending by score with the original
  index preserved. Empty `docs` yields `[]`.
- `RERANKER_PRESETS` registry with `bge-reranker-base`.
  `resolveRerankerPreset(id)` and `listSupportedRerankerModels()`
  helpers. Public type `RerankerPreset`.
- Public types: `RerankerCreateOptions`, `RerankOptions`,
  `RerankPipeline`, `RankedDocument`.
- `peerDependenciesMeta` marks `@huggingface/transformers` as
  optional — Chat / Completion users do not need to install it.
- 10 unit tests in `test/embeddings.test.ts` covering registry
  resolution, batch + single embedding, empty input short-circuit,
  pooling / normalize defaults and overrides, unload delegation,
  graceful unload when pipeline omits `unload()`.
- 10 unit tests in `test/reranker.test.ts` covering registry
  resolution, score order preservation, empty input short-circuit,
  sigmoid normalization, default raw-logit output, descending sort
  in `rank()`, unload delegation, graceful unload without
  `unload()`.
- `docs/getting-started.md` v0.3 update — new sections covering
  Embeddings, Reranker, the retrieve-then-rerank pattern, the
  embedding / reranker registries, and the new Web-Worker-by-default
  behavior. Existing sections (model registry, downloads, cache,
  troubleshooting) carry over unchanged.

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
