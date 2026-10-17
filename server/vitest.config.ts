import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Bootstraps the isolated test schema and applies migrations once.
    globalSetup: ['./tests/global-setup.ts'],
    // Runs in each worker before the app modules load, so they see test config.
    setupFiles: ['./tests/setup-env.ts'],
    // Database-backed tests share one schema, so run in a single fork serially.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
