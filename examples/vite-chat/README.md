# vite-chat — minimal browser demo

Minimal Vite app demonstrating `localm-web` `Chat` with streaming and `AbortSignal`.

Requires a browser with WebGPU enabled (Chrome 113+, Edge 113+, Safari 18+, Firefox Nightly with `dom.webgpu.enabled`).

## Run

From the repo root, install dependencies and start the dev server:

```bash
npm install
npm run build
cd examples/vite-chat
npm install
npm run dev
```

Open http://localhost:5173, pick a model, click **Load model**, wait for the download to finish, then chat.

## Notes

- First load downloads several hundred MB of model weights. Subsequent loads use the browser cache.
- The model runs on the user's GPU. CPU usage stays low; GPU usage is the bottleneck.
- The `Abort` button cancels an in-progress generation.
