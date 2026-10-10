import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests share one test database.
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://dudlextop@localhost:5432/botheist_test?schema=public",
    },
  },
});
