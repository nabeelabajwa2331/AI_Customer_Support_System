import { describe, expect, it } from 'vitest';

import {
  assertEmbeddingDimensions,
  EMBEDDING_DIMENSIONS,
} from '../src/knowledge/embedding.validation.js';

describe('assertEmbeddingDimensions', () => {
  it('accepts exactly 768 finite numeric values', () => {
    expect(EMBEDDING_DIMENSIONS).toBe(768);

    const embedding = Array.from(
      { length: EMBEDDING_DIMENSIONS },
      (_, index) => (index % 2 === 0 ? -1.5 : 2.5),
    );

    expect(() => assertEmbeddingDimensions(embedding)).not.toThrow();
  });

  it.each([767, 769, 1536])('rejects a %i-dimensional vector', (length) => {
    expect(() => assertEmbeddingDimensions(new Array<number>(length).fill(0))).toThrow(
      'Embedding must contain exactly 768 dimensions.',
    );
  });

  it('rejects a 768-element array containing a string', () => {
    const embedding = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
    (embedding as unknown as Array<number | string>)[0] = 'not-a-number';

    expect(() => assertEmbeddingDimensions(embedding)).toThrow(
      'Embedding must contain only finite numeric values; invalid value at index 0.',
    );
  });

  it.each([NaN, Infinity, -Infinity])('rejects %s', (value) => {
    const embedding = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
    embedding[0] = value;

    expect(() => assertEmbeddingDimensions(embedding)).toThrow(
      'Embedding must contain only finite numeric values; invalid value at index 0.',
    );
  });
});
