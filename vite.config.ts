import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname: string = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: (): string => "index.js",
    },
    rollupOptions: {
      external: [
        "@mlc-ai/web-llm",
        "onnxruntime-web",
        "@huggingface/transformers",
        "@huggingface/jinja",
      ],
    },
    target: "es2022",
    sourcemap: true,
    minify: false,
    emptyOutDir: true,
  },
  // Worker bundle inlines @mlc-ai/web-llm because workers can't resolve bare
  // specifiers at runtime. The worker chunk is lazy-loaded only when the
  // consumer opts into `inWorker: true`.
  worker: {
    format: "es",
    rollupOptions: {
      external: ["onnxruntime-web", "@huggingface/transformers", "@huggingface/jinja"],
    },
  },
  plugins: [
    dts({
      rollupTypes: true,
      include: ["src/**/*"],
      exclude: ["src/**/*.test.ts", "test"],
      tsconfigPath: "./tsconfig.json",
    }),
  ],
});
