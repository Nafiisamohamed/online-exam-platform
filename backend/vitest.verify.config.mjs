// Non-destructive verification of an already-migrated database (`npm run verify:db`).
// No reset and no migrations: tests run in transactions that are always rolled back,
// and the few tests that must commit rows are skipped. See docs/testing.md.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/db/**/*.test.mjs"],
    globalSetup: ["tests/verify-global-setup.mjs"],
    setupFiles: ["tests/verify-setup.mjs"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
