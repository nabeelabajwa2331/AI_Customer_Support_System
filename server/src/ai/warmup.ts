import { config } from '../config/env.js';
import { generateEmbedding } from '../knowledge/embedding.js';
import { createOllamaClient } from './ollama.client.js';

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

async function timed(label: string, task: () => Promise<unknown>): Promise<boolean> {
  const started = Date.now();

  try {
    await task();
    console.log(`[warmup] ${label} ready in ${Date.now() - started}ms.`);
    return true;
  } catch (error) {
    console.warn(`[warmup] ${label} could not be loaded: ${describeError(error)}`);
    return false;
  }
}

/**
 * Loads the embedding and chat models into Ollama so the first customer
 * question does not pay the cold-start cost. Runs sequentially to avoid
 * loading both models at once on low-memory machines. Never throws: a failed
 * warm-up only means the first request will be slower.
 */
export async function warmUpModels(): Promise<{ embedding: boolean; chat: boolean }> {
  // Hosted APIs have no cold start, and a warm-up call would spend quota.
  const skipEmbedding = config.embeddingProvider === 'openai-compatible';
  const skipChat = config.chatProvider === 'openai-compatible';
  if (skipEmbedding && skipChat) return { embedding: true, chat: true };

  const chatClient = createOllamaClient({
    baseUrl: config.ollamaBaseUrl,
    timeoutMs: config.ollamaChatTimeoutMs,
  });

  const embedding = skipEmbedding
    ? true
    : await timed(`Embedding model "${config.ollamaEmbeddingModel}"`, () =>
        generateEmbedding('warm-up'),
      );

  if (skipChat) return { embedding, chat: true };

  const chat = await timed(`Chat model "${config.ollamaChatModel}"`, () =>
    chatClient.chat({
      model: config.ollamaChatModel,
      messages: [{ role: 'user', content: 'Reply with OK.' }],
      temperature: 0,
    }),
  );

  return { embedding, chat };
}
