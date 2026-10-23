export const EMBEDDING_DIMENSIONS = 768;

export function assertEmbeddingDimensions(embedding: unknown): void {
  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding must contain exactly ${EMBEDDING_DIMENSIONS} dimensions.`,
    );
  }

  for (let index = 0; index < embedding.length; index += 1) {
    const value: unknown = embedding[index];

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(
        `Embedding must contain only finite numeric values; invalid value at index ${index}.`,
      );
    }
  }
}
