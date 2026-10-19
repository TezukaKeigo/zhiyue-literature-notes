import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "cloudflare:workers": fileURLToPath(new URL("./tests/support/runtime.ts", import.meta.url)),
      "next/headers": fileURLToPath(new URL("./tests/support/request-context.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,mjs}"],
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
    maxWorkers: 1,
    reporters: ["default", "junit"],
    outputFile: { junit: "test-results/junit.xml" },
  },
});
