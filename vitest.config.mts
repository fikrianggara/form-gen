import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // Component tests (.tsx) use the automatic JSX runtime; the project's
  // tsconfig jsx:preserve leaves JSX untouched for SWC, which esbuild can't run.
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false,
    pool: "forks",
    testTimeout: 20_000,
    hookTimeout: 30_000,
    include: [
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.test.tsx",
      "tests/integration/**/*.test.ts",
    ],
  },
});
