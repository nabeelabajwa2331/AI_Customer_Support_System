import { defineConfig } from 'vitest/config';

// Live integration tests: require Ollama running locally and TEST_DATABASE_URL.
// Not part of `npm test`, because they call the real models.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests-live/**/*.live.test.ts'],
    setupFiles: ['./tests/setup-env.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 60_000,
  },
});
