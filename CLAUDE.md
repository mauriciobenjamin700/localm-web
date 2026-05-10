# CLAUDE.md — localm-web

> Project directory is currently `ort-lm-sdk/`. Will be renamed to `localm-web/` once the public package name is finalized.

## Project Overview

`localm-web` is a **browser-only TypeScript SDK** for running Language Models (LLMs and SLMs) locally in the browser, with a developer experience modeled directly on `ort-vision-sdk-web`.

The SDK exposes high-level task classes (`Chat`, `Completion`, `Embeddings`, `Reranker`) on top of WebGPU-accelerated runtimes, so a developer can run Phi-3.5, Llama-3.2, Qwen2.5, Gemma-2 and similar models in a single line of code, with token streaming, tokenization, chat templates, model caching and structured output handled internally.

## Why this project exists

The Python ecosystem for local LMs is saturated (`llama-cpp-python`, `ollama`, `vLLM`, `transformers`, `text-generation-inference`). The browser side is **not**. Existing options are:

- **WebLLM (MLC)** — best raw performance via WebGPU, but the API is engine-centric and low-level.
- **transformers.js** — friendlier API but slower (no WebGPU-first model compilation in most paths).
- **onnxruntime-genai-web** — early/preview, unstable.

There is no equivalent of `ort-vision-sdk-web` for Language Models: no opinionated, task-oriented, strict-typed, Ultralytics-style SDK that just works in a Vite app. `localm-web` fills that gap.

## Scope

### In scope

- Browser runtime only (no Node, no Bun, no Deno-server).
- Task-level API: `Chat`, `Completion`, `Embeddings`, `Reranker`.
- Streaming token output via async generators with `AbortSignal`.
- Tokenization, chat templates, sampling, KV cache (delegated to underlying runtime).
- Model caching (Cache API + OPFS), resume on interrupted downloads.
- Curated model registry covering SLMs: Phi-3.5-mini, Llama-3.2-1B/3B, Qwen2.5-0.5B/1.5B/3B, Gemma-2-2B, SmolLM2.
- Structured output (JSON schema → constrained decoding).
- Web Worker execution to keep the UI thread free.
- ESM-only build, optimized for Vite consumers.

### Out of scope

- Server-side execution (Node/Edge runtimes).
- Training, fine-tuning, LoRA loading.
- Multi-modal inputs at v1.0 (vision-language models — defer to a future composite SDK that combines `ort-vision-sdk-web` + `localm-web`).
- GGUF / llama.cpp WASM backend (community-maintained options exist; not our differentiation).
- Bundling models into the package — models are downloaded at runtime from HuggingFace / MLC mirrors.
- UMD/IIFE/CJS builds. ESM only.

## Tech Stack

- **Language:** TypeScript 5.4+ (strict mode, ES2022 target).
- **Module format:** ESM only.
- **Build:** `tsc` for type-only / `vite build --mode lib` for the published bundle. Optimized for Vite 5+ consumers.
- **Primary runtime:** [WebLLM (MLC)](https://github.com/mlc-ai/web-llm) — Apache 2.0, WebGPU-first.
- **Fallback runtime (from v0.5):** [`onnxruntime-web`](https://github.com/microsoft/onnxruntime) + [`@huggingface/transformers`](https://github.com/huggingface/transformers.js) — for browsers without WebGPU.
- **Tokenizer:** `@huggingface/transformers` tokenizer module (HF tokenizer.json compatible).
- **Chat templates:** `@huggingface/jinja` (mini Jinja2 engine, ~10 KB).
- **Storage:** Cache API for models <1 GB; OPFS (Origin Private File System) for larger payloads.
- **Concurrency:** Web Worker via `Comlink` (or native `MessagePort` if it stays simple).
- **Tests:** Vitest + Playwright (real browser for WebGPU paths).
- **Lint/format:** ESLint + Prettier (strict TS config).

## Architecture

```
localm-web/
├── src/
│   ├── core/
│   │   ├── engine.ts             # backend abstraction
│   │   ├── webllm-engine.ts      # WebLLM wrapper (primary)
│   │   ├── ort-engine.ts         # ORT-Web + transformers.js fallback (v0.5+)
│   │   └── exceptions.ts
│   ├── tasks/
│   │   ├── lm-task.ts            # base class
│   │   ├── chat.ts               # multi-turn conversation
│   │   ├── completion.ts         # raw text-in text-out
│   │   ├── embeddings.ts         # vector embeddings
│   │   └── reranker.ts           # rerank documents
│   ├── io/
│   │   ├── tokenizer.ts          # tokenizer.json loader
│   │   └── chat-template.ts      # jinja-lite chat formatting
│   ├── sampling/
│   │   ├── greedy.ts
│   │   ├── top-k.ts
│   │   ├── top-p.ts
│   │   └── temperature.ts
│   ├── cache/
│   │   ├── kv-cache.ts           # browser KV cache abstraction
│   │   └── model-cache.ts        # IndexedDB / Cache API / OPFS
│   ├── streaming/
│   │   └── token-stream.ts       # async iterator + AbortSignal
│   ├── structured/
│   │   ├── json-schema.ts        # constrained decoding from JSON Schema
│   │   └── grammar.ts            # GBNF helper
│   ├── presets/
│   │   └── models.ts             # registry of supported models
│   ├── worker/
│   │   └── inference.worker.ts   # Web Worker entrypoint
│   ├── results.ts                # typed result classes
│   ├── types.ts                  # primitives (Message, ChatRequest, etc.)
│   └── index.ts                  # public API surface
├── test/                         # vitest + playwright tests
├── examples/                     # Vite demos (chat, embed, rerank)
├── docs/                         # extra docs (architecture, model registry)
├── package.json
├── tsconfig.json
├── vite.config.ts
├── README.md
├── CHANGELOG.md
├── LICENSE
└── CLAUDE.md
```

### Layer Responsibilities

- **`core/engine.ts`** — runtime-agnostic interface. Hides WebLLM vs ORT-Web from tasks.
- **`tasks/`** — Ultralytics-style classes. Each task owns its task-specific pre/post-processing and result shape.
- **`io/`** — tokenizer + chat-template loading. Pure functions, no runtime state.
- **`sampling/`** — token sampling strategies. Backend-independent.
- **`cache/`** — model files and KV cache persistence in the browser.
- **`streaming/`** — async generator helpers + cancellation plumbing.
- **`structured/`** — JSON Schema to grammar/logit-mask translation.
- **`presets/models.ts`** — curated registry. Each entry maps a friendly name (e.g. `"phi-3.5-mini"`) to MLC URL, ONNX fallback URL, tokenizer, chat template, recommended quantization.
- **`worker/`** — runs inference off the UI thread. Tasks delegate to it transparently.

## Public API (target shape)

```typescript
import { Chat, Completion, Embeddings, Reranker } from "localm-web";

// Chat
const chat = await Chat.create("phi-3.5-mini-int4");
const reply = await chat.send("Explain ONNX in one sentence.");
console.log(reply.text);

// Streaming
for await (const token of chat.stream("Explain ONNX.", { signal })) {
  process.stdout.write(token.text);
}

// Completion
const comp = await Completion.create("qwen2.5-0.5b-int4");
const out = await comp.predict("Once upon a time", { maxTokens: 100 });

// Embeddings
const emb = await Embeddings.create("bge-small-en-v1.5");
const vectors = await emb.embed(["hello world", "another sentence"]);

// Reranker
const rerank = await Reranker.create("bge-reranker-base");
const scores = await rerank.score("query", ["doc1", "doc2", "doc3"]);

// Structured output
const json = await chat.send("Extract user info from: ...", {
  jsonSchema: { type: "object", properties: { name: { type: "string" } } },
});
```

The shape mirrors `ort-vision-sdk-web`: `await Class.create(model)` then `predict()` / `send()` / `embed()` / `score()`.

## Code Style & Conventions

### Strings

Always **double quotes** (`"`).

### Type hints

Strict TypeScript. No implicit `any`. Every public function has explicit parameter and return types. JSDoc on every exported symbol.

```typescript
/**
 * Generate a chat reply for the given user message.
 *
 * @param message - The user-facing message text.
 * @param options - Optional generation options (temperature, signal, etc.).
 * @returns The generated assistant reply.
 * @throws ModelNotLoadedError if the engine has not finished loading.
 */
async send(message: string, options?: GenerationOptions): Promise<ChatReply> {
  // ...
}
```

### Async

Default to `async` for any I/O or inference call. Streaming uses `async function*` generators.

### Collections & empty results

Methods returning collections (`embed`, `score`, batch operations) return an empty array when nothing matches. Never throw a `NotFoundError` for empty results. The 404 convention applies only to single-resource lookups.

### Imports

- Absolute imports from the package root for internal cross-module references when convenient.
- Re-export from each module's `index.ts` so consumers import from the package root only.

```typescript
// ✅ Correct
import { Chat, Embeddings } from "localm-web";

// ❌ Wrong
import { Chat } from "localm-web/src/tasks/chat";
```

### Naming

- **Files/modules:** `kebab-case.ts`
- **Classes:** `PascalCase`
- **Functions/variables:** `camelCase`
- **Constants:** `UPPER_SNAKE_CASE`
- **Types/Interfaces:** `PascalCase`, no `I` prefix.
- **Result classes:** Suffix `Result` / `Reply` / `Embedding` (e.g. `ChatReply`, `EmbeddingResult`).

### Error handling

Custom error classes per failure mode (`ModelLoadError`, `WebGPUUnavailableError`, `QuotaExceededError`, `GenerationAbortedError`). Never throw raw `Error`.

## Versioning Roadmap

| Version  | Scope                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------- |
| **v0.1** | `Chat` via WebLLM. 3 models prebuilt: Phi-3.5-mini, Llama-3.2-1B, Qwen2.5-1.5B. Streaming with `AbortSignal`. |
| **v0.2** | `Completion` task. Model caching (Cache API + OPFS). Web Worker by default. Progress events.                  |
| **v0.3** | `Embeddings` task + `Reranker` task. BGE family via transformers.js.                                          |
| **v0.4** | Structured output (JSON Schema → grammar / logit masking).                                                    |
| **v0.5** | ORT-Web fallback for browsers without WebGPU. Auto-detect and graceful degrade.                               |
| **v0.6** | Function calling helper (tool use, schema-validated args).                                                    |
| **v1.0** | Documentation site, runnable demo, stable API contract.                                                       |

## Build & Distribution

- **`package.json`**: `"type": "module"`, `"exports"` pointing only at ESM entry, `"sideEffects": false`.
- **Build tool:** `vite build` in library mode (`build.lib`).
- **Output:** `dist/index.js` (ESM), `dist/index.d.ts` (types). No CJS, no UMD, no IIFE.
- **`peerDependencies`:** `@mlc-ai/web-llm`. Optional peers: `onnxruntime-web` and `@huggingface/transformers` for the v0.5 fallback path.
- **Vite-friendly:** explicit `optimizeDeps.exclude` guidance in README so the worker bundle isn't double-optimized.
- **Not Vercel-tied:** no `vercel.json`, no Next-specific helpers, no Edge runtime exports. Examples deployable on any static host (Cloudflare Pages, Netlify, GitHub Pages, S3, self-hosted).

## Testing

- **Unit:** Vitest for sampling, tokenizer, chat templates, JSON schema → grammar.
- **Integration:** Playwright in real Chrome with WebGPU enabled — drives the example app, asserts streaming output, checks console errors.
- **Performance smoke:** measure tokens/s on a fixed prompt against pinned model + browser version.

## Do's and Don'ts

### Do

- Wrap WebLLM, do not fork it.
- Stream tokens — never block the UI on full-completion APIs.
- Run inference in a Web Worker by default.
- Validate WebGPU support before attempting MLC; fall back gracefully (from v0.5).
- Use the curated model registry. Validate quantization fits target browser memory.
- Type everything. JSDoc every public symbol. Double quotes everywhere.

### Don't

- Don't add a Node/server build target.
- Don't bundle model weights into the package.
- Don't expose the underlying WebLLM/ORT engine as part of the public API surface — keep it internal so we can swap backends without breaking users.
- Don't add CJS/UMD/IIFE outputs.
- Don't depend on Vercel-specific APIs or build features.
- Don't ship a chat UI component. This is an SDK, not a chatbot kit.

## Security & vulnerabilities

Browser SDK = client-side runtime. Vulnerabilities split into two layers, treated differently:

### Runtime deps (ship to user)

`peerDependencies` and any future `dependencies` execute in the consumer's browser. **Zero tolerance** for known vulns. Before any release:

```bash
make validate                # roda npm audit implicitamente via npm ci
npm audit --omit=dev         # checa só o que vai pro bundle do consumidor
```

If `npm audit --omit=dev` reports anything, **block the release**. Never publish with known runtime CVEs.

### Dev deps (build/test only)

`devDependencies` (vite, vitest, eslint, prettier, esbuild) never reach the published bundle — they run on the maintainer's machine and in CI. Vulns there have lower blast radius (mostly: malicious site reading local dev-server response while you `npm run dev`). Still fix them, but the bar is "fix at next chore PR" not "block release".

### Policy when audit flags something

1. **Run `npm audit`** — read the advisory ID (GHSA-xxxx). Don't trust severity alone; read the impact section.
2. **Classify**: runtime (`peerDependencies` / `dependencies`) vs dev-only (`devDependencies`). Runtime → block. Dev-only → schedule.
3. **Prefer minimal fix**:
   - Direct dep → bump in `devDependencies` / `peerDependencies` (semver-respecting first).
   - Transitive dep → use `overrides` in `package.json` to pin the safe version without bumping the parent.
4. **Avoid `npm audit fix --force`** — it picks latest majors and breaks the build silently. Bump explicitly, run `make validate`, commit.
5. **Pin `overrides` with care**: only for transitive vulns where the parent hasn't released a fix. Document the GHSA ID in `CHANGELOG.md` so future you knows when it can be removed.
6. **CI gate**: every PR runs `npm ci` which surfaces vulns. The `release-npm.yml` workflow runs `npm ci` + tests before publishing — so a vulnerable `package-lock.json` blocks publish.

### Things to never do

- Don't disable `npm audit` warnings.
- Don't commit a `package-lock.json` that introduces new advisories without a `chore: bump` PR explaining why.
- Don't use `--no-verify` / `--no-audit` flags.
- Don't ship a runtime dep with a known critical/high vuln, even if "the consumer can patch it" — they can't, peer deps install at their level but resolution semantics still leak our version range into their lockfile.
- Don't bundle WebLLM model weights or any third-party model registry data into the package — keeps supply chain narrow.

### Browser-side concerns (consumer code)

When documenting examples / Vite app demos, remind consumers:

- Models load from external URLs (HuggingFace mirrors, MLC CDN). Use Subresource Integrity (SRI) when possible, or self-host the weights.
- Cache API + OPFS persist model bytes on the user's disk — surface this in privacy policy.
- WebGPU access is gated by the user's browser; don't paper over `WebGPUUnavailableError` with retries that look like crashes.

## References

- WebLLM (MLC): https://github.com/mlc-ai/web-llm
- ONNX Runtime Web: https://github.com/microsoft/onnxruntime
- transformers.js: https://github.com/huggingface/transformers.js
- HuggingFace tokenizers / chat templates: https://huggingface.co/docs
- Sister project (DX reference): `ort-vision-sdk` — https://github.com/mauriciobenjamin700/ort-vision-sdk
