# localm-web

> ⚠️ **Status: pre-alpha.** Public API is being designed and is expected to change. Code in this repo is intentionally minimal until v0.1.

Browser-only TypeScript SDK for running Language Models (LLMs and SLMs) **locally in the user's browser**, with a developer experience modeled directly on [`ort-vision-sdk-web`](https://github.com/mauriciobenjamin700/ort-vision-sdk).

```typescript
import { Chat } from "localm-web";

const chat = await Chat.create("phi-3.5-mini-int4");

for await (const token of chat.stream("Explain ONNX in one sentence.")) {
  process.stdout.write(token.text);
}
```

That's it. No server, no API key, no roundtrip — the model runs **on the user's GPU** via WebGPU.

---

## Why does this exist?

The Python ecosystem for local Language Models is saturated: `llama-cpp-python`, Ollama, vLLM, `transformers`, text-generation-inference, and dozens more. Picking up another Python wrapper adds nothing.

The **browser side is different**. The closest equivalents are:

| Project | What it is | Why it's not enough |
|---------|------------|---------------------|
| [WebLLM (MLC)](https://github.com/mlc-ai/web-llm) | Best-in-class WebGPU runtime | Engine-centric, low-level API, no opinionated tasks |
| [transformers.js](https://github.com/huggingface/transformers.js) | HF pipeline API in the browser | Slower (no WebGPU-first compilation in many paths), broad surface |
| `onnxruntime-genai-web` | Microsoft's web LM build | Preview, unstable, no high-level tasks |

There is no opinionated, task-oriented, strict-typed, **Ultralytics-style SDK that just works in a Vite app**. `localm-web` fills that gap.

The mental model is straightforward: if [`ort-vision-sdk-web`](https://github.com/mauriciobenjamin700/ort-vision-sdk) is what `Detector` / `Classifier` / `Segmenter` look like for vision, then `localm-web` is what `Chat` / `Completion` / `Embeddings` / `Reranker` look like for language.

## Design principles

1. **Browser-only.** No Node target, no server runtime. If your code runs on a backend, this SDK is the wrong tool — use `transformers`, vLLM, Ollama, or any of the dozens of mature Python options.
2. **Maximum performance.** WebGPU-first via WebLLM (MLC). Web Worker execution by default so the UI thread stays free. WASM-SIMD fallback for non-WebGPU browsers from v0.5.
3. **Ultralytics-style DX.** `await Class.create(model)` then `predict()` / `send()` / `embed()` / `score()`. Mirrors `ort-vision-sdk-web` so a developer using both feels continuity.
4. **ESM only.** No CJS, no UMD, no IIFE. The browser is ESM-native, modern bundlers expect ESM, and shipping multiple formats just bloats the package.
5. **Vite-first.** The build is optimized for Vite 5+ consumers. Other bundlers will still work, but Vite is the supported smooth path.
6. **Not tied to Vercel.** No `vercel.json`, no Next-specific helpers, no Edge runtime exports. Examples deploy to any static host (Cloudflare Pages, Netlify, GitHub Pages, S3, self-hosted).
7. **Wrap, don't fork.** WebLLM stays a peer dependency. We add the API layer, the task abstractions, and the missing pieces (embeddings, reranker, structured output, fallback runtime).

## Scope

### In scope
- Browser-only execution (WebGPU primary, WASM-SIMD fallback from v0.5).
- High-level tasks: `Chat`, `Completion`, `Embeddings`, `Reranker`.
- Streaming token output via async generators with `AbortSignal` support.
- Tokenization, chat templates, sampling, KV cache (delegated to the underlying runtime).
- Model caching (Cache API + OPFS) with resume on interrupted downloads.
- Curated registry of supported SLMs: Phi-3.5-mini, Llama-3.2-1B/3B, Qwen2.5-0.5B/1.5B/3B, Gemma-2-2B, SmolLM2.
- Structured output: JSON Schema → constrained decoding.
- Web Worker execution out of the box.

### Out of scope
- Server-side execution (Node, Bun, Deno).
- Training, fine-tuning, LoRA loading.
- Multi-modal models at v1.0 (a future composite SDK may combine `ort-vision-sdk-web` + `localm-web`).
- A llama.cpp / GGUF backend — community-maintained options exist; that's not our differentiation.
- A pre-built chat UI. This is an SDK, not a chatbot kit.
- Bundling model weights into the package — models are downloaded at runtime.
- Non-ESM module formats.

## Architecture

```
localm-web/
├── src/
│   ├── core/         # backend abstraction + WebLLM / ORT-Web engines
│   ├── tasks/        # Chat, Completion, Embeddings, Reranker
│   ├── io/           # tokenizer + chat-template loaders
│   ├── sampling/     # greedy, top-k, top-p, temperature
│   ├── cache/        # KV cache + model file cache (Cache API / OPFS)
│   ├── streaming/    # async iterator + AbortSignal plumbing
│   ├── structured/   # JSON Schema → grammar / logit-mask
│   ├── presets/      # curated model registry
│   ├── worker/       # Web Worker entrypoint for inference
│   ├── results.ts    # typed result classes
│   ├── types.ts      # primitive types (Message, ChatRequest, etc.)
│   └── index.ts      # public API
├── test/
├── examples/
├── docs/
└── ...
```

A full layer-by-layer breakdown lives in [CLAUDE.md](./CLAUDE.md).

## Tech stack

- **Language:** TypeScript 5.4+, strict mode, ES2022 target.
- **Module format:** ESM only.
- **Build:** Vite 5+ in library mode, `tsc` for declarations.
- **Primary runtime:** [WebLLM (MLC)](https://github.com/mlc-ai/web-llm), Apache 2.0, WebGPU-first.
- **Fallback runtime (v0.5+):** [`onnxruntime-web`](https://github.com/microsoft/onnxruntime) + [`@huggingface/transformers`](https://github.com/huggingface/transformers.js).
- **Tokenizer:** `@huggingface/transformers` tokenizer module.
- **Chat templates:** `@huggingface/jinja`.
- **Storage:** Cache API + OPFS (Origin Private File System).
- **Concurrency:** Web Worker via `Comlink` (or native `MessagePort`).
- **Tests:** Vitest + Playwright (real browser for WebGPU).
- **Lint/format:** ESLint + Prettier.

## Public API (target shape)

```typescript
import { Chat, Completion, Embeddings, Reranker } from "localm-web";

// Chat — multi-turn conversation with chat template applied
const chat = await Chat.create("phi-3.5-mini-int4");
const reply = await chat.send("Explain ONNX in one sentence.");
console.log(reply.text);

// Streaming
const controller = new AbortController();
for await (const token of chat.stream("Explain ONNX.", { signal: controller.signal })) {
  process.stdout.write(token.text);
}

// Completion — raw text-in text-out (no chat template)
const comp = await Completion.create("qwen2.5-0.5b-int4");
const out = await comp.predict("Once upon a time", { maxTokens: 100 });

// Embeddings
const emb = await Embeddings.create("bge-small-en-v1.5");
const vectors = await emb.embed(["hello world", "another sentence"]);

// Reranker
const rerank = await Reranker.create("bge-reranker-base");
const scores = await rerank.score("query", ["doc1", "doc2", "doc3"]);

// Structured output (JSON Schema → constrained decoding)
const json = await chat.send("Extract user info from: ...", {
  jsonSchema: { type: "object", properties: { name: { type: "string" } } },
});
```

The shape mirrors `ort-vision-sdk-web`: `await Class.create(model)` then `predict()` / `send()` / `embed()` / `score()`.

## Versioning roadmap

| Version | Scope |
|---------|-------|
| **v0.1** | `Chat` via WebLLM. Phi-3.5-mini, Llama-3.2-1B, Qwen2.5-1.5B. Streaming with `AbortSignal`. |
| **v0.2** | `Completion` task. Model caching (Cache API + OPFS). Web Worker by default. Progress events. |
| **v0.3** | `Embeddings` and `Reranker` tasks. BGE family via transformers.js. |
| **v0.4** | Structured output (JSON Schema → grammar / logit masking). |
| **v0.5** | ORT-Web fallback for browsers without WebGPU. Auto-detection and graceful degradation. |
| **v0.6** | Function calling helper (tool use with schema-validated arguments). |
| **v1.0** | Documentation site, runnable demos, stable API contract. |

## Browser support

- **WebGPU:** Chrome 113+, Edge 113+, recent Firefox Nightly with `dom.webgpu.enabled`, Safari 18+ on macOS Sonoma+ / iOS 18+.
- **Without WebGPU:** from v0.5, a WASM-SIMD fallback path will run smaller models acceptably. Below v0.5, a clear runtime error is raised when WebGPU is missing.

## Installation

> Not yet published. Once v0.1 ships:

```bash
npm install localm-web @mlc-ai/web-llm
```

`@mlc-ai/web-llm` is a peer dependency — the consumer pins the version, which keeps the SDK lightweight and avoids version conflicts.

## Vite usage

The package is designed to drop into a Vite app with no extra config. The Web Worker is bundled via Vite's native worker support; just import the SDK and use it.

A complete example will live under `examples/vite-chat/` once v0.1 lands.

## Why not server-side?

Three reasons:

1. **Mature alternatives exist.** Python and TS already have excellent server-side LM tooling (Ollama, vLLM, llama-cpp-python, transformers, llama.cpp Node bindings). Adding another wrapper is noise.
2. **The browser is the underserved surface.** Running models on the user's device removes the server cost, keeps data local, and unlocks offline use cases — but the DX is currently rough.
3. **Different concerns.** Server inference cares about throughput, batching, multi-tenant scheduling. Browser inference cares about cold-start time, model caching, UI thread isolation, WebGPU compatibility. Conflating them produces a bad SDK on both sides.

## Contributing

Pre-alpha. Issues and design discussion welcome. PRs deferred until the v0.1 surface stabilizes.

## License

MIT — see [LICENSE](./LICENSE).

## Related projects

- [`ort-vision-sdk`](https://github.com/mauriciobenjamin700/ort-vision-sdk) — sibling SDK for computer vision (classification, detection, segmentation). Same DX patterns, same author.
