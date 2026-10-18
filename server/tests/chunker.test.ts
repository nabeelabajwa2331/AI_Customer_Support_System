import { describe, expect, it } from 'vitest';
import { chunkText } from '../src/knowledge/chunker.js';

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

  it('preserves overlap between chunks', () => {
    const words = Array.from({ length: 10 }, (_, i) => `word${i + 1}`);
    const result = chunkText(words.join(' '), {
      chunkSize: 4,
      overlap: 1,
    });

    expect(result).toHaveLength(3);
    expect(result[0]?.content).toBe('word1 word2 word3 word4');
    expect(result[1]?.content).toBe('word4 word5 word6 word7');
    expect(result[2]?.content).toBe('word7 word8 word9 word10');
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
