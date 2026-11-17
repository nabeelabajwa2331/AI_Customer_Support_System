import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const mocks = vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.AUTH_SECRET = 'test-only-auth-secret-do-not-use-in-production-0123456789';

  return {
    userFindUnique: vi.fn(),
    docFindMany: vi.fn(),
    docFindUnique: vi.fn(),
    docDeleteMany: vi.fn(),
  };
});

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    knowledgeDocument: {
      findMany: mocks.docFindMany,
      findUnique: mocks.docFindUnique,
      deleteMany: mocks.docDeleteMany,
    },
  },
}));
vi.mock('../src/knowledge/knowledge.repository.js', () => ({ saveKnowledgeDocument: vi.fn() }));
vi.mock('../src/lib/jwt.js', () => ({
  verifyAccessToken: vi.fn(async () => ({ sub: 'user-1', email: 'u@example.com', role: 'ADMIN' })),
  signAccessToken: vi.fn(),
}));

import { createApp } from '../src/app.js';

const app = createApp();
const DOC_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

const row = {
  id: DOC_ID,
  title: 'refund-policy.txt',
  source: 'refund-policy.txt',
  mimeType: 'text/plain',
  status: 'READY',
  metadata: { characterCount: 240, chunkCount: 1 },
  createdAt: new Date('2026-11-01T10:00:00Z'),
  updatedAt: new Date('2026-11-01T10:00:00Z'),
  createdBy: { id: 'admin-1', name: 'Admin' },
  _count: { chunks: 1 },
};

function as(role: string) {
  mocks.userFindUnique.mockResolvedValue({ id: 'user-1', email: 'u@example.com', role });
}

beforeEach(() => {
  vi.clearAllMocks();
  as('ADMIN');
});

describe('GET /api/knowledge/documents', () => {
  it('lists document metadata without text, chunks or embeddings', async () => {
    mocks.docFindMany.mockResolvedValue([row]);

    const res = await request(app).get('/api/knowledge/documents').set('Authorization', 'Bearer t');

    expect(res.status).toBe(200);
    expect(res.body.documents).toEqual([
      {
        id: DOC_ID,
        title: 'refund-policy.txt',
        source: 'refund-policy.txt',
        mimeType: 'text/plain',
        status: 'READY',
        chunkCount: 1,
        characterCount: 240,
        createdAt: '2026-11-01T10:00:00.000Z',
        updatedAt: '2026-11-01T10:00:00.000Z',
        createdBy: { id: 'admin-1', name: 'Admin' },
      },
    ]);
  });

  it('allows SUPPORT_AGENT and forbids CUSTOMER', async () => {
    mocks.docFindMany.mockResolvedValue([]);

    as('SUPPORT_AGENT');
    expect(
      (await request(app).get('/api/knowledge/documents').set('Authorization', 'Bearer t')).status,
    ).toBe(200);

    as('CUSTOMER');
    expect(
      (await request(app).get('/api/knowledge/documents').set('Authorization', 'Bearer t')).status,
    ).toBe(403);
  });

  it('requires authentication', async () => {
    expect((await request(app).get('/api/knowledge/documents')).status).toBe(401);
  });
});

describe('GET /api/knowledge/documents/:id', () => {
  it('returns one document', async () => {
    mocks.docFindUnique.mockResolvedValue(row);

    const res = await request(app)
      .get(`/api/knowledge/documents/${DOC_ID}`)
      .set('Authorization', 'Bearer t');

    expect(res.status).toBe(200);
    expect(res.body.document).toMatchObject({ id: DOC_ID, chunkCount: 1 });
  });

  it('returns 404 DOCUMENT_NOT_FOUND for an unknown id', async () => {
    mocks.docFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/knowledge/documents/${DOC_ID}`)
      .set('Authorization', 'Bearer t');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('DOCUMENT_NOT_FOUND');
  });

  it('returns 400 for a malformed id without querying the database', async () => {
    const res = await request(app)
      .get('/api/knowledge/documents/not-a-uuid')
      .set('Authorization', 'Bearer t');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(mocks.docFindUnique).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/knowledge/documents/:id', () => {
  it('lets an ADMIN delete a document', async () => {
    mocks.docDeleteMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .delete(`/api/knowledge/documents/${DOC_ID}`)
      .set('Authorization', 'Bearer t');

    expect(res.status).toBe(200);
    expect(mocks.docDeleteMany).toHaveBeenCalledWith({ where: { id: DOC_ID } });
  });

  it('returns 404 when the document does not exist', async () => {
    mocks.docDeleteMany.mockResolvedValue({ count: 0 });

    const res = await request(app)
      .delete(`/api/knowledge/documents/${DOC_ID}`)
      .set('Authorization', 'Bearer t');

    expect(res.status).toBe(404);
  });

  it.each(['SUPPORT_AGENT', 'CUSTOMER'])('forbids %s', async (role) => {
    as(role);

    const res = await request(app)
      .delete(`/api/knowledge/documents/${DOC_ID}`)
      .set('Authorization', 'Bearer t');

    expect(res.status).toBe(403);
    expect(mocks.docDeleteMany).not.toHaveBeenCalled();
  });
});
