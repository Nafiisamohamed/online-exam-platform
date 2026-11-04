import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // tests/db: database rules (SQL); tests/unit: pure logic; tests/api: the Express API.
    include: ["tests/**/*.test.mjs", "tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.mjs"],
    setupFiles: ["tests/setup-env.mjs"],
    // Test files share one database, so run them one after another.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
