import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // tsconfig sets jsx: "preserve" because Next requires it, which leaves JSX
  // unparsed for Vitest. Transform it here so component modules are importable
  // from tests.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "packages/nfc-writer/tests/**/*.test.ts"],
    // Integration tests share one Postgres database, so they must not interleave.
    fileParallelism: false,
    testTimeout: 30_000,
    setupFiles: ["tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@pmops/nfc-core": path.resolve(__dirname, "./packages/nfc-core/src/index.ts"),
      "@pmops/nfc-writer": path.resolve(__dirname, "./packages/nfc-writer/src/index.ts"),
    },
  },
});
