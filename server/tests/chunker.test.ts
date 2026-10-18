import { describe, expect, it } from 'vitest';
import { chunkText } from '../src/knowledge/chunker.js';
import { encode } from "gpt-tokenizer";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/chunker.test.ts",
      "tests/document-extractor.test.ts",
    ],
  },
});

describe('chunkText', () => {
  it('returns an empty array for empty text', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   ')).toEqual([]);
  });

  it('creates one chunk for short text', () => {
    const result = chunkText('Hello customer support', {
      chunkSize: 10,
      overlap: 2,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.content).toBe('Hello customer support');
    expect(result[0]?.chunkIndex).toBe(0);
    expect(result[0]?.tokenCount).toBe(3);
  });


  it("preserves token overlap between chunks", () => {
    const result = chunkText(
      "The quick brown fox jumps over the lazy dog",
      {
        chunkSize: 5,
        overlap: 2,
      },
    );

    expect(result.length).toBeGreaterThan(1);

    for (const chunk of result) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(5);
    }

    for (let i = 1; i < result.length; i++) {
      const previous = result[i - 1];
      const current = result[i];

      expect(previous).toBeDefined();
      expect(current).toBeDefined();

      if (previous && current) {
        const previousIds = encode(previous.content);
        const currentIds = encode(current.content);

        expect(previousIds.slice(-2)).toEqual(
          currentIds.slice(0, 2),
        );
      }
    }
  });


  it('rejects invalid chunk options', () => {
    expect(() => chunkText('some text', { chunkSize: 0, overlap: 0 })).toThrow(
      'chunkSize must be a positive integer.',
    );

    expect(() => chunkText('some text', { chunkSize: 5, overlap: 5 })).toThrow(
      'overlap must be smaller than chunkSize.',
    );
  });
});
