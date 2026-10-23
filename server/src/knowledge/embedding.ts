import { createOllamaClient } from '../ai/ollama.client.js';
import { config } from '../config/env.js';

const ollama = createOllamaClient({
  baseUrl: config.ollamaBaseUrl,
  timeoutMs: config.ollamaTimeoutMs,
});

export async function generateEmbedding(text: string): Promise<number[]> {
  const normalizedText = text.trim();

  if (!normalizedText) {
    throw new Error('Cannot generate an embedding for empty text.');
  }

  return ollama.embed(normalizedText, {
    model: config.ollamaEmbeddingModel,
    dimensions: config.embeddingDimensions,
  });
}
