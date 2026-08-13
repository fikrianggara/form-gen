import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false,
    pool: "forks",
    testTimeout: 20_000,
    hookTimeout: 30_000,
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
  },
});
