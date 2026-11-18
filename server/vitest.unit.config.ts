import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'tests/chat.routes.test.ts',
      'tests/chat.service.test.ts',
      'tests/chunker.test.ts',
      'tests/deploy-config.test.ts',
      'tests/document-extractor.test.ts',
      'tests/duration-check.test.ts',
      'tests/embedding.validation.test.ts',
      'tests/env-chat-min-similarity.test.ts',
      'tests/error-handler.test.ts',
      'tests/env-ollama-chat-timeout.test.ts',
      'tests/env-port.test.ts',
      'tests/ingestion.test.ts',
      'tests/knowledge.repository.validation.test.ts',
      'tests/knowledge.documents.test.ts',
      'tests/knowledge.search.test.ts',
      'tests/migration-definition.test.ts',
      'tests/ollama.client.test.ts',
      'tests/openai-compatible.client.test.ts',
      'tests/rate-limits.test.ts',
      'tests/retrieval.test.ts',
      'tests/test-database-url.test.ts',
      'tests/warmup.test.ts',
    ],
  },
});
