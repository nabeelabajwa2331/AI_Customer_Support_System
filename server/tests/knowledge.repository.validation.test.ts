import { beforeEach, describe, expect, it, vi } from 'vitest';

const { transactionMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
}));

vi.mock('@prisma/client', () => {
  class PrismaClientMock {
    $transaction = transactionMock;
  }

  return {
    PrismaClient: PrismaClientMock,
    Prisma: {},
  };
});

import { saveKnowledgeDocument } from '../src/knowledge/knowledge.repository.js';

describe('saveKnowledgeDocument validation', () => {
  beforeEach(() => {
    transactionMock.mockReset();
  });

  it('rejects a non-768-dimensional vector before opening a transaction', async () => {
    await expect(
      saveKnowledgeDocument({
        title: 'Invalid embedding',
        mimeType: 'text/plain',
        text: 'Invalid embedding test',
        chunks: [
          {
            chunkIndex: 0,
            content: 'Invalid embedding test',
            tokenCount: 4,
            embedding: new Array<number>(767).fill(0),
          },
        ],
      }),
    ).rejects.toThrow('Embedding must contain exactly 768 dimensions.');

    expect(transactionMock).not.toHaveBeenCalled();
  });

  it.each([NaN, Infinity, -Infinity, 'not-a-number'])(
    'rejects invalid embedding value %s before opening a transaction',
    async (invalidValue) => {
      const embedding = new Array<number>(768).fill(0);
      embedding[0] = invalidValue as number;

      await expect(
        saveKnowledgeDocument({
          title: 'Invalid embedding',
          mimeType: 'text/plain',
          text: 'Invalid embedding test',
          chunks: [
            {
              chunkIndex: 0,
              content: 'Invalid embedding test',
              tokenCount: 4,
              embedding,
            },
          ],
        }),
      ).rejects.toThrow(
        'Embedding must contain only finite numeric values; invalid value at index 0.',
      );

      expect(transactionMock).not.toHaveBeenCalled();
    },
  );

  it('accepts 768 dimensions and reaches the parameterized insert path', async () => {
    const executeRawMock = vi.fn(async () => 1);

    transactionMock.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          knowledgeDocument: {
            create: vi.fn(async () => ({ id: 'document-id' })),
            update: vi.fn(async () => ({ id: 'document-id', status: 'READY' })),
          },
          $executeRaw: executeRawMock,
        };

        return callback(tx);
      },
    );

    const result = await saveKnowledgeDocument({
      title: 'Valid embedding',
      mimeType: 'text/plain',
      text: 'Valid embedding test',
      chunks: [
        {
          chunkIndex: 0,
          content: 'Valid embedding test',
          tokenCount: 4,
          embedding: new Array<number>(768).fill(0),
        },
      ],
    });

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(executeRawMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ id: 'document-id', status: 'READY' });
  });
});
