import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/index.ts",
        "src/worker/**",
        "src/core/webllm-engine.ts",
      ],
    },
    typecheck: {
      tsconfig: "./tsconfig.test.json",
    },
  },
});
