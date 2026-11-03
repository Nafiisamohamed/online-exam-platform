import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.mjs"],
    globalSetup: ["tests/global-setup.mjs"],
    setupFiles: ["tests/setup-env.mjs"],
    // Test files share one database, so run them one after another.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 120_000,
  },
});
