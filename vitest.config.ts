import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration tests share one Postgres database, so they must not interleave.
    fileParallelism: false,
    testTimeout: 30_000,
    setupFiles: ["tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@pmops/nfc-core": path.resolve(__dirname, "./packages/nfc-core/src/index.ts"),
    },
  },
});
