import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/knowledge.repository.test.ts'],
    // Validate TEST_DATABASE_URL and set DATABASE_URL before test modules load.
    setupFiles: ['./tests/setup-env.ts'],
    // Create the test schema and apply migrations to the dedicated test database.
    globalSetup: ['./tests/global-setup.ts'],
    // Database-backed tests must not run in parallel.
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
