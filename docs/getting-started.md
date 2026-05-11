# Getting started

A practical walkthrough for downloading a model and running your first prompt locally with `localm-web`. Everything runs in the user's browser — no server, no API key, no roundtrip.

> **Audience:** developers integrating `localm-web` into a Vite + TypeScript app. If you only want to play with the SDK before writing code, jump to [Run the example app](#run-the-example-app).

## Table of contents

- [Prerequisites](#prerequisites)
- [Install](#install)
- [First chat in 10 lines](#first-chat-in-10-lines)
- [Embeddings and Reranker for retrieval](#embeddings-and-reranker-for-retrieval)
- [Structured output](#structured-output)
- [Backends and the ORT-Web fallback](#backends-and-the-ort-web-fallback)
- [Available models](#available-models)
- [How a model downloads](#how-a-model-downloads)
- [Where the model lives on disk](#where-the-model-lives-on-disk)
- [Run the example app](#run-the-example-app)
- [Cold start, RAM and what to expect](#cold-start-ram-and-what-to-expect)
- [Inspect, clear and re-download](#inspect-clear-and-re-download)
- [Offline behavior](#offline-behavior)
- [Web Worker by default](#web-worker-by-default)
- [Troubleshooting](#troubleshooting)

## Prerequisites

| Requirement                                                                          | Why                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Chrome 113+ / Edge 113+ / Safari 18+ / Firefox Nightly with `dom.webgpu.enabled`** | The SDK runs models on the GPU via WebGPU when available. The transformers.js + WASM-SIMD fallback (v0.5) lifts the strict requirement, but WebGPU is still ~10× faster — keep it on whenever you can. |
| **HTTPS or `localhost`**                                                             | WebGPU is gated to secure contexts. `vite dev` serves on `localhost` so this is automatic in development.                                                                                              |
| **8 GB RAM minimum, 16 GB recommended**                                              | Quantized SLMs need 1–4 GB of GPU memory plus a few hundred MB for the runtime.                                                                                                                        |
| **Stable network for the first load**                                                | Weights are downloaded from a public CDN (HuggingFace mirror). Subsequent loads come from the local cache.                                                                                             |
| **Node 22+ for the dev workflow**                                                    | The SDK itself is browser-only, but the build tooling (Vite, Vitest) needs Node 22 or 24 (CI matrix).                                                                                                  |

To confirm WebGPU is enabled in your browser, open the DevTools console and run:

```js
console.log("gpu" in navigator); // true means you're good
```

If it returns `false`, see [Troubleshooting → WebGPU unavailable](#troubleshooting).

## Install

```bash
npm install localm-web @mlc-ai/web-llm
```

`@mlc-ai/web-llm` is a **peer dependency** — you pin the version, the SDK doesn't bundle it. This keeps the package light and lets you upgrade WebLLM independently.

If you use pnpm or yarn, the same shape applies:

```bash
pnpm add localm-web @mlc-ai/web-llm
yarn add localm-web @mlc-ai/web-llm
```

## First chat in 10 lines

Create a TypeScript file in your Vite app (e.g. `src/chat-demo.ts`) and import the SDK:

```typescript
import { Chat } from "localm-web";

const chat = await Chat.create("llama-3.2-1b-int4", {
  onProgress: (p) => console.log(`${p.phase} ${(p.progress * 100).toFixed(0)}%`),
});

for await (const token of chat.stream("Explain WebGPU in one sentence.")) {
  process.stdout.write(token.text);
}
```

That's it. The first call to `Chat.create` downloads ~700 MB of weights for `llama-3.2-1b-int4`, compiles the WebGPU shaders, and returns a ready-to-use chat instance. Subsequent calls skip the download.

For raw text continuation (no chat template, no history), use `Completion`:

```typescript
import { Completion } from "localm-web";

const comp = await Completion.create("qwen2.5-1.5b-int4");
const result = await comp.predict("Once upon a time", { maxTokens: 60 });
console.log(result.text);
```

## Embeddings and Reranker for retrieval

For retrieval-augmented apps the SDK ships two more tasks. Both are backed by `@huggingface/transformers` (a separate, **optional** peer dependency). Install it only when you need them:

```bash
npm install @huggingface/transformers
```

### Embeddings — dense vectors

```typescript
import { Embeddings } from "localm-web";

const emb = await Embeddings.create("bge-small-en-v1.5");
const vectors = await emb.embed(["WebGPU is a modern graphics API", "Bananas grow on trees"]);
console.log(vectors[0].length); // 384
```

`embed()` returns one `number[]` per input string in the same order. Empty input yields `[]` (no error). Defaults: `pooling: "mean"`, `normalize: true`. BGE-style models perform better with `pooling: "cls"`.

For a single string, `embedSingle(text)` unwraps the first vector:

```typescript
const v = await emb.embedSingle("hello world");
```

### Reranker — cross-encoder second pass

```typescript
import { Reranker } from "localm-web";

const rerank = await Reranker.create("bge-reranker-base");
const scores = await rerank.score("what is webgpu?", [
  "WebGPU is a modern graphics API for the web",
  "Bananas grow on trees",
  "WebAssembly compiles native code to a portable bytecode",
]);
// scores[0] >> scores[1], scores[2] in between
```

`score()` returns raw logits by default. Pass `{ sigmoid: true }` to map them into `[0, 1]` for use as probabilities.

For a sorted result preserving the original index, use `rank()`:

```typescript
const ranked = await rerank.rank("what is webgpu?", docs);
for (const r of ranked) console.log(r.score.toFixed(3), r.text);
```

### Putting it together — retrieve then rerank

```typescript
const emb = await Embeddings.create("bge-small-en-v1.5");
const rerank = await Reranker.create("bge-reranker-base");

const corpus = ["doc1…", "doc2…", "doc3…", "doc4…"];
const corpusVecs = await emb.embed(corpus);

async function search(query: string, topK: number, finalK: number) {
  const [qv] = await emb.embed([query]);
  const candidates = corpusVecs
    .map((v, i) => ({ i, sim: cosine(qv!, v) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, topK)
    .map(({ i }) => ({ i, text: corpus[i]! }));
  const scored = await rerank.rank(
    query,
    candidates.map((c) => c.text)
  );
  return scored.slice(0, finalK).map((r) => candidates[r.index]!);
}
```

`cosine()` is a standard dot-product over L2-normalized vectors — ten lines of code or borrow from any vector library.

## Structured output

From v0.4, both `Chat` and `Completion` accept two flags on `GenerationOptions` that constrain the generated text to valid JSON. Behind the scenes the SDK forwards them to WebLLM's `response_format`; WebLLM uses [xgrammar](https://github.com/mlc-ai/xgrammar) to mask invalid tokens during sampling, so the model is **physically unable to emit malformed JSON** (no retry-on-parse-error loops, no regex post-processing).

### `json: true` — free-form JSON

Use when you want a JSON object but you don't care about the exact shape:

```typescript
import { Chat } from "localm-web";

const chat = await Chat.create("phi-3.5-mini-int4");
const reply = await chat.send("List three pros and three cons of WebGPU as a JSON object.", {
  json: true,
});

const data = reply.json<{ pros: string[]; cons: string[] }>();
console.log(data.pros, data.cons);
```

`reply.text` is the raw JSON string; `reply.json<T>()` is a thin wrapper around `JSON.parse` that throws `StructuredOutputError` on malformed input and returns the value cast to `T`. The cast is **not** validated — `T` is a type-level convenience, not a runtime guarantee.

### `jsonSchema` — schema-constrained decoding

Pass a JSON Schema and the model is forced to emit a value matching it. The schema is forwarded verbatim to xgrammar:

```typescript
import { Chat } from "localm-web";

const userSchema = {
  type: "object",
  required: ["name", "age", "interests"],
  properties: {
    name: { type: "string" },
    age: { type: "integer", minimum: 0 },
    interests: { type: "array", items: { type: "string" }, minItems: 1 },
  },
} as const;

const chat = await Chat.create("phi-3.5-mini-int4");
const reply = await chat.send(
  "Extract the user info from: 'Ada, 36, loves analytical engines and Lord Byron'.",
  { jsonSchema: userSchema }
);

interface User {
  name: string;
  age: number;
  interests: string[];
}

const user = reply.json<User>();
console.log(user.name, user.age, user.interests);
```

When both `json` and `jsonSchema` are set, `jsonSchema` wins — no need to drop `json: true` to upgrade to a schema.

### `Completion` works the same way

The same flags work on raw text completion:

```typescript
import { Completion } from "localm-web";

const comp = await Completion.create("qwen2.5-1.5b-int4");
const result = await comp.predict("Return three primes as JSON.\nResult:", {
  jsonSchema: {
    type: "array",
    items: { type: "integer" },
    minItems: 3,
    maxItems: 3,
  },
});

const primes = result.json<number[]>();
```

### Error handling

The only failure mode the SDK introduces here is `StructuredOutputError`, raised when:

- the value passed as `jsonSchema` is not a recognizable JSON Schema (missing `type`, `$ref`, `oneOf`, `anyOf`, `allOf`, `enum`, `const`, or `properties`); or
- the engine output somehow does not parse as JSON (rare with constrained decoding but possible if the runtime falls back to free-form text — for example when an unsupported `response_format` is silently ignored).

```typescript
import { Chat, StructuredOutputError } from "localm-web";

try {
  const reply = await chat.send("…", { json: true });
  const data = reply.json();
} catch (err) {
  if (err instanceof StructuredOutputError) {
    console.warn("Output was not valid JSON:", err.cause);
  } else {
    throw err;
  }
}
```

### Schema tips

- Mark required fields explicitly. xgrammar will still emit unrequired fields if the model decides to, which usually inflates token count for no reason.
- Prefer `enum` over free-form strings whenever the answer comes from a small fixed set — the model never has to "spell" the value, so latency and accuracy both improve.
- Bound array sizes (`minItems` / `maxItems`) to avoid runaway generations.
- The SDK does **not** validate the parsed value against the schema — constrained decoding makes that redundant in the happy path. If you want defense-in-depth (e.g. a different model, an upstream cache layer, or a third-party `response_format` provider), pair `.json()` with [Ajv](https://ajv.js.org/) or [Zod](https://zod.dev/) on your side.

For a runnable end-to-end demo, see [`examples/vite-structured/`](../examples/vite-structured/).

## Backends and the ORT-Web fallback

From v0.5 the SDK ships two interchangeable inference backends:

| Backend                                       | Driver                                                                        | Runs on                 | Trade-off                                                       |
| --------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------- |
| **WebLLM** (default when WebGPU is available) | [`@mlc-ai/web-llm`](https://github.com/mlc-ai/web-llm)                        | WebGPU only             | Fastest tokens/s, full xgrammar support, smallest startup cost. |
| **transformers.js fallback**                  | [`@huggingface/transformers`](https://github.com/huggingface/transformers.js) | WebGPU **or** WASM-SIMD | Wider browser support (works without WebGPU), slower on CPU.    |

The backend is picked automatically — you almost never have to think about it. Pass `backend` in `LMTaskCreateOptions` to override:

```typescript
import { Chat } from "localm-web";

// Default — picks WebLLM if WebGPU is available, else transformers.js
const chat = await Chat.create("phi-3.5-mini-int4");

// Force the fallback (useful for testing the WASM path on a WebGPU-capable browser)
const fb = await Chat.create("phi-3.5-mini-int4", { backend: "transformers" });

// Force WebLLM (will throw WebGPUUnavailableError on a browser without WebGPU)
const fast = await Chat.create("phi-3.5-mini-int4", { backend: "webllm" });
```

`BackendChoice` is the public type: `"auto" | "webllm" | "transformers"`.

### Optional peer dep

The fallback runtime is an **optional** peer dependency. Install it only when you want the fallback path:

```bash
npm install @huggingface/transformers
```

When `backend: "auto"` resolves to transformers but the package is not installed, the dynamic import fails with `ModelLoadError`. WebLLM consumers can safely omit it.

### Models that support both backends

Each `ModelPreset` may carry both a `webllmId` and a `transformersId`. The curated registry ships dual mappings for the three v0.1 chat presets plus a new tiny entry tuned for the fallback path:

```typescript
import { resolveModelPreset, listSupportedModels } from "localm-web";

for (const id of listSupportedModels()) {
  const preset = resolveModelPreset(id);
  console.log(id, "→ webllm:", preset.webllmId, "transformers:", preset.transformersId ?? "(none)");
}
```

If you force `backend: "transformers"` on a preset with no `transformersId`, the SDK raises `BackendNotAvailableError` immediately — no silent fallback to WebLLM.

### Custom routing

Use the exported `resolveBackend` helper to test your routing logic:

```typescript
import { resolveBackend, resolveModelPreset } from "localm-web";

const preset = resolveModelPreset("phi-3.5-mini-int4");
const chosen = resolveBackend("auto", preset, "gpu" in navigator);
console.log(chosen); // "webllm" or "transformers"
```

### Worker note

The bundled inference Web Worker only knows about WebLLM in v0.5. When the resolved backend is `"transformers"` the SDK runs inference on the main thread regardless of `inWorker`. Heavy generations may jank frames on low-end devices — keep the prompt short or pre-warm the page transition. A worker variant for the transformers.js path is on the v0.6 roadmap.

## Available models

The SDK ships with a curated registry. Every entry has been validated to load in WebGPU-enabled browsers and to fit the SLM target (≤ 4B parameters at INT4):

| Friendly id         | Family    | Params | Approx download | Approx GPU RAM | Use it for                                                                |
| ------------------- | --------- | ------ | --------------- | -------------- | ------------------------------------------------------------------------- |
| `llama-3.2-1b-int4` | Llama 3.2 | 1.0 B  | ~700 MB         | ~1.2 GB        | Smallest viable chat. Fast on integrated GPUs.                            |
| `qwen2.5-1.5b-int4` | Qwen 2.5  | 1.5 B  | ~1.0 GB         | ~1.6 GB        | Strong multilingual + code. Solid sweet spot.                             |
| `phi-3.5-mini-int4` | Phi-3.5   | 3.8 B  | ~2.2 GB         | ~3.5 GB        | Highest quality in the registry. Needs a discrete GPU or high-RAM laptop. |

Get the full list at runtime:

```typescript
import { listSupportedModels, MODEL_PRESETS } from "localm-web";

console.log(listSupportedModels()); // ["phi-3.5-mini-int4", "llama-3.2-1b-int4", "qwen2.5-1.5b-int4"]
console.log(MODEL_PRESETS["llama-3.2-1b-int4"]);
// { id, family, parameters, quantization, webllmId, contextWindow, description }
```

The chat / completion registry will grow over v0.4–v0.5 to cover Phi-3.5, Llama-3.2-3B, Qwen2.5-0.5B / 3B, Gemma-2-2B and SmolLM2.

### Embedding models (v0.3+)

| Friendly id         | Family | Dim | Approx download | Use it for                                                           |
| ------------------- | ------ | --- | --------------- | -------------------------------------------------------------------- |
| `bge-small-en-v1.5` | BGE    | 384 | ~33 MB          | Default for English retrieval. Fast on integrated GPUs.              |
| `bge-base-en-v1.5`  | BGE    | 768 | ~110 MB         | Higher quality at 2× the cost. Use when retrieval precision matters. |

```typescript
import { listSupportedEmbeddingModels, EMBEDDING_PRESETS } from "localm-web";

console.log(listSupportedEmbeddingModels()); // ["bge-small-en-v1.5", "bge-base-en-v1.5"]
```

### Reranker models (v0.3+)

| Friendly id         | Family       | Max tokens | Use it for                                                 |
| ------------------- | ------------ | ---------- | ---------------------------------------------------------- |
| `bge-reranker-base` | BGE Reranker | 512        | Multilingual cross-encoder for retrieve-then-rerank flows. |

```typescript
import { listSupportedRerankerModels, RERANKER_PRESETS } from "localm-web";

console.log(listSupportedRerankerModels()); // ["bge-reranker-base"]
```

## How a model downloads

1. **Resolve.** `Chat.create("llama-3.2-1b-int4", …)` looks up the friendly id in the registry and resolves the underlying WebLLM (MLC) identifier.
2. **Fetch.** WebLLM downloads weight shards (`*.bin`), the tokenizer (`tokenizer.json`) and metadata from the public MLC HuggingFace mirror. Files are streamed in parallel.
3. **Cache.** Each file is stored in the browser's [Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache) under the origin that loaded the SDK. Total size for a 1 B INT4 model is ~700 MB.
4. **Compile.** WebGPU shaders are compiled. This is one-time-per-browser-session for new model architectures.
5. **Ready.** The engine emits a `ModelLoadProgress` event with `phase: "ready"` exactly once.

While the download is in flight you receive granular progress events:

```typescript
await Chat.create("llama-3.2-1b-int4", {
  onProgress: (p) => {
    // p.phase is one of: "downloading" | "compiling" | "loading" | "ready"
    // p.progress is in [0, 1]
    // p.text is the runtime's free-form status (e.g. "Fetching param shard 12/24")
    updateUI(p);
  },
});
```

The `phase` field lets you drive UI state machines without parsing strings — a typical pattern is showing a spinner during `downloading`, swapping to a determinate progress bar with `progress`, and displaying a "ready" badge when `phase === "ready"`.

## Where the model lives on disk

Weights are persisted by the browser, scoped to the origin (protocol + host + port) that loaded the SDK. This means:

- **Per-origin cache.** A model downloaded on `https://app-a.example.com` is not visible to `https://app-b.example.com` even if both use the same `localm-web` version.
- **Per-browser cache.** The Chrome cache, Firefox cache and Safari cache are all separate. Switching browsers re-downloads the model.
- **Per-profile cache.** Browser profiles (Chrome's "person 1", "person 2") have isolated storage.

Storage backends (current and planned):

| Backend                           | Status                             | Used for                                        |
| --------------------------------- | ---------------------------------- | ----------------------------------------------- |
| Cache API                         | v0.1+ (current default via WebLLM) | Weight shards, tokenizer.json                   |
| OPFS (Origin Private File System) | v0.2 (planned)                     | Models > 1 GB; faster reads + structured layout |
| IndexedDB                         | not used                           | —                                               |

You can inspect the Cache API contents from DevTools: **Application → Storage → Cache Storage**.

## Run the example app

The repository ships a runnable Vite app under [`examples/vite-chat/`](../examples/vite-chat/) so you can experiment with the SDK before integrating it.

```bash
git clone https://github.com/mauriciobenjamin700/localm-web.git
cd localm-web

# install workspace deps once
npm ci

# run the example
cd examples/vite-chat
npm install
npm run dev
```

Open the printed URL (usually `http://localhost:5173`). Pick a model from the dropdown, click **Load**, watch the progress bar, then send prompts. The example exercises:

- Loading any registry model with progress events.
- Streaming generation token-by-token.
- Aborting an in-flight stream via `AbortController`.

The example is intentionally plain HTML + a single `main.ts` — no framework, no styles. Read the source: it's < 100 lines and mirrors what your integration code will look like.

### Iterating without re-downloading

When you reload `localhost:5173`, the model **stays cached**. You only pay the download cost once per browser. Switching models triggers a fresh download for the new model only — the previously loaded one stays in the cache.

If you want to force a clean download (e.g. to test the cold-start UX), see [Inspect, clear and re-download](#inspect-clear-and-re-download).

## Cold start, RAM and what to expect

Rough numbers from a 2024-era laptop with a discrete GPU on Chrome 130+:

| Step                        | First time   | Second time (cached) |
| --------------------------- | ------------ | -------------------- |
| Network download (1 B INT4) | 30 s – 3 min | 0 s                  |
| Cache decode + load         | 2–5 s        | 2–5 s                |
| WebGPU shader compile       | 5–15 s       | 0–2 s (cached)       |
| Time to first token         | 0.3–1.0 s    | 0.3–1.0 s            |
| Throughput                  | 30–80 tok/s  | 30–80 tok/s          |

Tips:

- **Pre-load on idle.** Start `Chat.create()` as soon as the page loads; show the chat UI in a disabled state and enable it on `phase: "ready"`.
- **Don't load multiple models in parallel.** Each model holds GPU memory; loading two large models at once will OOM on most machines.
- **Call `chat.unload()` when leaving the page.** Frees GPU memory immediately instead of waiting for GC.
- **Smaller is better for first impressions.** Default to `llama-3.2-1b-int4` for casual users; offer `phi-3.5-mini-int4` as an opt-in "high quality" tier.

## Inspect, clear and re-download

### Inspect cached files

In Chrome / Edge:

1. Open DevTools (`F12`).
2. Go to **Application → Storage → Cache Storage**.
3. Expand the WebLLM cache (look for a key containing `webllm/`).
4. You'll see weight shards, tokenizer files, and config JSON.

You can also list cache keys programmatically:

```typescript
const keys = await caches.keys();
console.log(keys); // includes the WebLLM cache name
```

### Clear a single model

The simplest path is to delete the entire WebLLM cache (forces re-download of every cached model on next load):

1. DevTools → **Application → Storage → Cache Storage**.
2. Right-click the WebLLM cache → **Delete**.

For per-model deletion, use the WebLLM helper directly (the SDK does not expose this in v0.1; planned for v0.2 alongside OPFS support):

```typescript
import { deleteModelInCache } from "@mlc-ai/web-llm";
await deleteModelInCache("Llama-3.2-1B-Instruct-q4f16_1-MLC");
```

### Clear everything for the origin

DevTools → **Application → Storage → Clear site data** wipes the Cache API, IndexedDB, OPFS, cookies and storage in one click. Useful when reproducing first-load UX.

## Offline behavior

After the first successful load:

- **Online + cached:** instant load from Cache API. No network requests.
- **Offline + cached:** instant load from Cache API. No network requests.
- **Offline + not cached:** `ModelLoadError` is thrown — the SDK can't fetch the weights.

To make a deployment offline-friendly out of the box, pre-fetch the model on first launch (e.g. behind a "Set up" button) and surface a clear error when the user is offline before the cache is warm:

```typescript
import { Chat, ModelLoadError } from "localm-web";

try {
  const chat = await Chat.create("llama-3.2-1b-int4", { onProgress: updateUI });
} catch (err) {
  if (err instanceof ModelLoadError && !navigator.onLine) {
    showOfflineFirstLoadHint();
  } else {
    throw err;
  }
}
```

## Web Worker by default

From v0.3, `Chat.create()` and `Completion.create()` spawn a Web Worker by default. Tokenization, sampling and WebGPU dispatches run off the UI thread; your animations and user input stay smooth even during long generations.

You don't need to do anything to opt in — calling `Chat.create("…")` already gets you the worker:

```typescript
const chat = await Chat.create("llama-3.2-1b-int4"); // Web Worker by default
```

To opt out (for example, when debugging the runtime or running in an environment without `Worker` support), pass `inWorker: false`:

```typescript
const chat = await Chat.create("llama-3.2-1b-int4", { inWorker: false });
```

A few practical notes:

- The worker is **lazy-loaded**. Bundles that call `Chat.create()` only fetch the worker chunk when a chat is created — apps that opt out via `inWorker: false` never download it.
- The worker bundle includes `@mlc-ai/web-llm` (workers can't resolve bare specifiers at runtime). It's ~6.5 MB pre-gzip and ~1.5 MB gzipped — paid once per user, then cached.
- `Embeddings` and `Reranker` (v0.3+) currently run on the main thread. Worker integration is planned for a later release.

## Troubleshooting

### WebGPU unavailable

Symptom: `WebGPUUnavailableError` thrown on `Chat.create`.

Causes and fixes:

- **Browser too old.** Update to Chrome / Edge 113+ or Safari 18+.
- **Firefox.** Stable Firefox doesn't ship WebGPU yet. Use Firefox Nightly and set `dom.webgpu.enabled = true` in `about:config`.
- **Linux + Mesa.** Some integrated drivers are blocked; launch Chrome with `--enable-features=Vulkan` to test.
- **Headless or sandboxed environments.** WebGPU is disabled in many CI/headless browsers. Validate the SDK in a real browser.
- **HTTP, not HTTPS.** Move to `localhost` or HTTPS — `http://192.168.x.x` does not enable WebGPU.

> **v0.5 update:** With `backend: "auto"` (the default), `localm-web` automatically routes to the transformers.js fallback when WebGPU is unavailable, so you usually get a working chat instead of an error — at the cost of slower CPU inference. You only see `WebGPUUnavailableError` if you explicitly pass `backend: "webllm"`. See [Backends and the ORT-Web fallback](#backends-and-the-ort-web-fallback).

### Model load stalls at 0 %

The first byte hasn't arrived yet. Check:

- Network tab — are requests pending or 404?
- DevTools console — is there a CORS error from the HuggingFace mirror?
- Corporate proxies / firewalls often block large CDN downloads. Test on a residential connection.

### "Quota exceeded" / `QuotaExceededError`

The browser refused to write more bytes to Cache API + OPFS. Causes:

- **Disk full.** Free up local disk space.
- **Browser storage quota hit.** Chrome allots ~60 % of free disk space per origin; Firefox is stricter. Clear storage for unused origins.
- **Private / Incognito window.** Storage quota is much smaller and ephemeral. Use a normal window for first-time downloads.

### Runs slowly / glitches the UI

Inference runs on the main thread in v0.1. The Web Worker integration is planned for v0.2 and will isolate inference automatically.

Until then:

- Don't run animations during streaming.
- Use `chat.stream()` (which yields per token) over `chat.send()` to keep the event loop responsive.
- Lower `maxTokens` for snappier replies.

### Vite warns about pre-bundling

If `vite dev` complains about `@mlc-ai/web-llm` being pre-bundled, add it to `optimizeDeps.exclude`:

```typescript
// vite.config.ts
import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    exclude: ["@mlc-ai/web-llm", "localm-web"],
  },
});
```

## Next steps

- Browse the [examples folder](../examples/) for runnable integrations:
  - [`vite-chat/`](../examples/vite-chat/) — minimal streaming chat with `AbortSignal`.
  - [`vite-structured/`](../examples/vite-structured/) — JSON mode and `jsonSchema` constrained decoding side by side.
- Read the [security policy](../README.md#security) before deploying.
- Track upcoming features in the [versioning roadmap](../README.md#versioning-roadmap).

If something in this guide is wrong or missing, [open an issue](https://github.com/mauriciobenjamin700/localm-web/issues/new) — feedback during pre-1.0 is the most valuable contribution.
