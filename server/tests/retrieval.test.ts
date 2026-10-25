import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateEmbeddingMock, queryRawMock } = vi.hoisted(() => ({
  generateEmbeddingMock: vi.fn(async (_text: string) => [] as number[]),
  queryRawMock: vi.fn(async (..._args: unknown[]) => [] as unknown[]),
}));

vi.mock('../src/knowledge/embedding.js', () => ({
  generateEmbedding: generateEmbeddingMock,
}));

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    $queryRaw: queryRawMock,
  },
}));

import {
  DEFAULT_RETRIEVAL_TOP_K,
  MAX_RETRIEVAL_TOP_K,
  retrieveKnowledge,
} from '../src/knowledge/retrieval.js';

const embedding = Array.from({ length: 768 }, (_, index) => index / 768);

const row = {
  chunkId: 'chunk-1',
  documentId: 'document-1',
  chunkIndex: 2,
  content: 'Refunds are available within 30 days.',
  tokenCount: 7,
  distance: 0.25,
  title: 'Refund policy',
  source: 'refund-policy.md',
  sourceType: null,
  mimeType: 'text/markdown',
};

beforeEach(() => {
  generateEmbeddingMock.mockReset();
  queryRawMock.mockReset();
  generateEmbeddingMock.mockResolvedValue(embedding);
  queryRawMock.mockResolvedValue([row]);
});

describe('retrieveKnowledge', () => {
  it('rejects an empty query without generating an embedding or querying PostgreSQL', async () => {
    await expect(retrieveKnowledge('   ')).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });

    expect(generateEmbeddingMock).not.toHaveBeenCalled();
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, MAX_RETRIEVAL_TOP_K + 1, Number.NaN])(
    'rejects an out-of-bounds topK value: %s',
    async (topK) => {
      await expect(retrieveKnowledge('refund policy', { topK })).rejects.toMatchObject({
        status: 400,
        code: 'VALIDATION_ERROR',
      });

      expect(generateEmbeddingMock).not.toHaveBeenCalled();
      expect(queryRawMock).not.toHaveBeenCalled();
    },
  );

  it('accepts the maximum bounded topK value', async () => {
    queryRawMock.mockResolvedValue([]);

    await expect(
      retrieveKnowledge('refund policy', { topK: MAX_RETRIEVAL_TOP_K }),
    ).resolves.toEqual([]);

    const values = queryRawMock.mock.calls[0]?.slice(1) ?? [];
    expect(values[1]).toBe(MAX_RETRIEVAL_TOP_K);
  });

  it('wraps embedding provider failures without querying PostgreSQL', async () => {
    generateEmbeddingMock.mockRejectedValue(new Error('Ollama is offline'));

    await expect(retrieveKnowledge('refund policy')).rejects.toMatchObject({
      status: 502,
      code: 'EMBEDDING_FAILED',
      message: 'Could not generate a query embedding.',
    });

    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed embedding before querying PostgreSQL', async () => {
    generateEmbeddingMock.mockResolvedValue(new Array<number>(767).fill(0));

    await expect(retrieveKnowledge('refund policy')).rejects.toMatchObject({
      status: 502,
      code: 'INVALID_EMBEDDING',
    });

    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it('rejects non-finite embedding values before querying PostgreSQL', async () => {
    const malformed = new Array<number>(768).fill(0);
    malformed[0] = Number.NaN;
    generateEmbeddingMock.mockResolvedValue(malformed);

    await expect(retrieveKnowledge('refund policy')).rejects.toMatchObject({
      status: 502,
      code: 'INVALID_EMBEDDING',
    });

    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it('returns an empty array when no chunks match', async () => {
    queryRawMock.mockResolvedValue([]);

    await expect(retrieveKnowledge('refund policy')).resolves.toEqual([]);
  });

  it('maps chunk, document, distance, and similarity fields', async () => {
    const result = await retrieveKnowledge('refund policy');

    expect(result).toEqual([
      {
        chunkId: 'chunk-1',
        documentId: 'document-1',
        chunkIndex: 2,
        content: 'Refunds are available within 30 days.',
        tokenCount: 7,
        distance: 0.25,
        similarity: 0.75,
        document: {
          id: 'document-1',
          title: 'Refund policy',
          source: 'refund-policy.md',
          sourceType: null,
          mimeType: 'text/markdown',
        },
      },
    ]);
  });

  it('passes the embedding and bounded topK as parameters without embedding query text in SQL', async () => {
    const query = "refund'; DROP TABLE document_chunks; --";

    await retrieveKnowledge(query, { topK: 3 });

    expect(generateEmbeddingMock).toHaveBeenCalledWith(query);

    const call = queryRawMock.mock.calls[0];
    expect(call).toBeDefined();

    const strings = call?.[0] as TemplateStringsArray;
    const values = call?.slice(1) ?? [];
    const sqlTemplate = strings.join('?');

    expect(sqlTemplate).toContain('(c.embedding <=> ?::vector)');
    expect(sqlTemplate).toContain('LIMIT ?');
    expect(sqlTemplate).toContain("d.status = 'READY'");
    expect(values).toEqual([`[${embedding.join(',')}]`, 3]);
    expect(sqlTemplate).not.toContain(query);
    expect(values).not.toContain(query);
  });

  it('uses the default topK when none is supplied', async () => {
    await retrieveKnowledge('refund policy');

    const values = queryRawMock.mock.calls[0]?.slice(1) ?? [];
    expect(values[1]).toBe(DEFAULT_RETRIEVAL_TOP_K);
  });

  it('trims the query before generating its embedding', async () => {
    await retrieveKnowledge('  refund policy  ');

    expect(generateEmbeddingMock).toHaveBeenCalledWith('refund policy');
  });

  it('wraps PostgreSQL failures without exposing database details', async () => {
    queryRawMock.mockRejectedValue(new Error('syntax error near secret_table'));

    await expect(retrieveKnowledge('refund policy')).rejects.toMatchObject({
      status: 500,
      code: 'RETRIEVAL_FAILED',
      message: 'Knowledge retrieval failed.',
    });
  });
});
