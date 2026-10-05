import { defineConfig } from "vitest/config";

// Runs this module's tests on their own, with no database, no app setup and no
// path aliases: if they pass here, the module does not secretly depend on the
// host app. `npm run test:nfc-writer` from the repo root.
export default defineConfig({
  test: {
    root: import.meta.dirname,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
