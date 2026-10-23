import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'tests/chunker.test.ts',
      'tests/document-extractor.test.ts',
      'tests/embedding.validation.test.ts',
      'tests/ingestion.test.ts',
      'tests/knowledge.repository.validation.test.ts',
      'tests/migration-definition.test.ts',
      'tests/ollama.client.test.ts',
      'tests/test-database-url.test.ts',
    ],
  },
});
