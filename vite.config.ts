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
  plugins: [
    dts({
      rollupTypes: true,
      include: ["src/**/*"],
      exclude: ["src/**/*.test.ts", "test"],
      tsconfigPath: "./tsconfig.json",
    }),
  ],
});
