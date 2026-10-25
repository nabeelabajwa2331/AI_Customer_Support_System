import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const { retrieveKnowledgeMock, verifyAccessTokenMock, findUniqueMock } = vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.AUTH_SECRET = 'test-only-auth-secret-do-not-use-in-production-0123456789';

  return {
    retrieveKnowledgeMock: vi.fn(async (..._args: unknown[]) => [] as unknown[]),
    verifyAccessTokenMock: vi.fn(async (..._args: unknown[]) => ({
      sub: 'user-1',
      email: 'customer@example.com',
      role: 'CUSTOMER',
    })),
    findUniqueMock: vi.fn(async (..._args: unknown[]) => ({
      id: 'user-1',
      email: 'customer@example.com',
      role: 'CUSTOMER',
    })),
  };
});

vi.mock('../src/knowledge/retrieval.js', () => ({
  retrieveKnowledge: retrieveKnowledgeMock,
}));

// The upload route is not exercised here, but mocking it avoids constructing a
// real PrismaClient while loading the shared application.
vi.mock('../src/knowledge/knowledge.repository.js', () => ({
  saveKnowledgeDocument: vi.fn(),
}));

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: findUniqueMock,
    },
  },
}));

vi.mock('../src/lib/jwt.js', () => ({
  verifyAccessToken: verifyAccessTokenMock,
  signAccessToken: vi.fn(),
}));

import { createApp } from '../src/app.js';
import { AppError } from '../src/lib/errors.js';

const app = createApp();

const results = [
  {
    chunkId: 'chunk-1',
    documentId: 'document-1',
    chunkIndex: 0,
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
];

function search(body: Record<string, unknown>, token: string | null = 'valid-token') {
  const req = request(app).post('/api/knowledge/search').send(body);

  if (token) {
    req.set('Authorization', `Bearer ${token}`);
  }

  return req;
}

beforeEach(() => {
  retrieveKnowledgeMock.mockReset();
  verifyAccessTokenMock.mockReset();
  findUniqueMock.mockReset();

  verifyAccessTokenMock.mockResolvedValue({
    sub: 'user-1',
    email: 'customer@example.com',
    role: 'CUSTOMER',
  });
  findUniqueMock.mockResolvedValue({
    id: 'user-1',
    email: 'customer@example.com',
    role: 'CUSTOMER',
  });
  retrieveKnowledgeMock.mockResolvedValue(results);
});

describe('POST /api/knowledge/search', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).post('/api/knowledge/search').send({ query: 'refund policy' });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      success: false,
      code: 'UNAUTHENTICATED',
    });
    expect(retrieveKnowledgeMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid bearer token', async () => {
    verifyAccessTokenMock.mockRejectedValue(new Error('bad token'));

    const res = await search({ query: 'refund policy' }, 'not-a-valid-token');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
    expect(retrieveKnowledgeMock).not.toHaveBeenCalled();
  });

  it('returns retrieved results for an authenticated CUSTOMER', async () => {
    const res = await search({ query: '  refund policy  ', topK: 3 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, results });
    expect(retrieveKnowledgeMock).toHaveBeenCalledWith('refund policy', { topK: 3 });
    expect(JSON.stringify(res.body)).not.toContain('embedding');
  });

  it('returns an empty result list consistently', async () => {
    retrieveKnowledgeMock.mockResolvedValue([]);

    const res = await search({ query: 'no matching policy' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, results: [] });
  });

  it('rejects a missing query', async () => {
    const res = await search({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      code: 'VALIDATION_ERROR',
    });
    expect(retrieveKnowledgeMock).not.toHaveBeenCalled();
  });

  it.each(['', '   '])('rejects an empty query value: %j', async (query) => {
    const res = await search({ query });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      code: 'VALIDATION_ERROR',
    });
    expect(retrieveKnowledgeMock).not.toHaveBeenCalled();
  });

  it('rejects a non-string query', async () => {
    const res = await search({ query: 42 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(retrieveKnowledgeMock).not.toHaveBeenCalled();
  });

  it.each([0, -1, 21, 1.5, '3'])('rejects an invalid topK value: %j', async (topK) => {
    const res = await search({ query: 'refund policy', topK });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      code: 'VALIDATION_ERROR',
    });
    expect(retrieveKnowledgeMock).not.toHaveBeenCalled();
  });

  it('passes the default topK behavior through when topK is omitted', async () => {
    await search({ query: 'refund policy' });

    expect(retrieveKnowledgeMock).toHaveBeenCalledWith('refund policy', {});
  });

  it('returns the standard error envelope for retrieval failures', async () => {
    retrieveKnowledgeMock.mockRejectedValue(
      new AppError(500, 'RETRIEVAL_FAILED', 'Knowledge retrieval failed.'),
    );

    const res = await search({ query: 'refund policy' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      code: 'RETRIEVAL_FAILED',
      message: 'Knowledge retrieval failed.',
    });
    expect(res.body).not.toHaveProperty('stack');
  });
});
