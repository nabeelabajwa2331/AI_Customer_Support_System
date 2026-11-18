import { createEmbeddingClient } from '../ai/providers.js';
import { config } from '../config/env.js';

const client = createEmbeddingClient();

export async function generateEmbedding(text: string): Promise<number[]> {
  const normalizedText = text.trim();

  if (!normalizedText) {
    throw new Error('Cannot generate an embedding for empty text.');
  }

  return client.embed(normalizedText, {
    model: config.embeddingModel,
    dimensions: config.embeddingDimensions,
  });
}
