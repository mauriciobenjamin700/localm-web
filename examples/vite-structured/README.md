# vite-structured — JSON mode + JSON Schema demo

Minimal Vite app demonstrating `localm-web` structured output: `json: true` for free-form JSON and `jsonSchema` for constrained decoding via xgrammar (inside WebLLM).

Requires a browser with WebGPU enabled (Chrome 113+, Edge 113+, Safari 18+, Firefox Nightly with `dom.webgpu.enabled`).

## Run

From the repo root:

```bash
npm install
npm run build
cd examples/vite-structured
npm install
npm run dev
```

Open <http://localhost:5174>, pick a model, click **Load model**, wait for the download, then click **Generate**.

## What it shows

- Toggle between **`json: true`** (free-form valid JSON) and **`jsonSchema`** (decoder constrained by the schema in the textarea).
- Left pane: `reply.text` — the raw string emitted by the model.
- Right pane: `reply.json()` — the parsed value re-stringified with indentation. Errors surface as `StructuredOutputError` with the underlying `JSON.parse` cause.
- Edit the schema textarea live to see how the constraint shapes the output. Try removing `required`, swapping `integer` for `string`, narrowing arrays via `minItems` / `maxItems`, or adding `enum` values.

## Why two panes

Constrained decoding makes `reply.text` already valid JSON in the happy path. Showing the raw text alongside the parsed view makes it obvious that:

1. The string really is well-formed (no regex post-processing, no retry-on-error loop).
2. The shape conforms to the schema (or, when `json: true` is used alone, that the model picked a shape on its own).

## Notes

- First load downloads several hundred MB of model weights. Subsequent loads use the browser cache.
- Phi-3.5-mini follows JSON Schemas more reliably than the smaller models, at the cost of bigger download / RAM. Try qwen2.5-1.5b first if you want a faster cold start.
- The SDK does **not** validate the parsed value against the schema — constrained decoding makes that redundant. If you want defense-in-depth (e.g. against a future provider that ignores `response_format`), pair `.json()` with [Ajv](https://ajv.js.org/) or [Zod](https://zod.dev/) in your code.
