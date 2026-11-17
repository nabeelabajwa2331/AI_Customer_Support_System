// Live integration tests: the real Express app, the real Ollama models, and the
// dedicated TEST database (setup-env.ts refuses to run against DATABASE_URL).
// Run with: npx vitest run --config vitest.live.config.ts
import type { Role } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { hashPassword } from '../src/lib/password.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();
const RUN = `live-${Date.now()}`;
const PASSWORD = 'LiveTestPass123';

const POLICY_TEXT = [
  'Shipping Policy',
  '',
  'Standard shipping is free for orders over 50 dollars.',
  'Orders are dispatched within 2 business days.',
  'Customers can track their parcel using the tracking link in the confirmation email.',
  // Unique per run so a leftover document from an interrupted run never causes a 409.
  `Reference ${RUN}.`,
].join('\n');

let adminToken = '';
let customerToken = '';
let customerRefreshToken = '';
const userIds: string[] = [];
let userCount = 0;

async function createUser(role: Role) {
  userCount += 1;
  const user = await prisma.user.create({
    data: {
      name: `${role} ${RUN}`,
      email: `${role.toLowerCase()}-${userCount}-${RUN}@example.test`,
      passwordHash: await hashPassword(PASSWORD),
      role,
    },
  });
  userIds.push(user.id);

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: PASSWORD });
  expect(res.status).toBe(200);

  return {
    user,
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
  };
}

function upload(token: string | undefined, name: string, content: string | Buffer) {
  const req = request(app).post('/api/knowledge/upload');
  if (token) req.set('Authorization', `Bearer ${token}`);
  return req.attach('file', Buffer.isBuffer(content) ? content : Buffer.from(content), name);
}

beforeAll(async () => {
  const admin = await createUser('ADMIN');
  const customer = await createUser('CUSTOMER');
  adminToken = admin.accessToken;
  customerToken = customer.accessToken;
  customerRefreshToken = customer.refreshToken;
});

afterAll(async () => {
  // Remove only what this run created (documents cascade to their chunks).
  await prisma.knowledgeDocument.deleteMany({ where: { createdById: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('Knowledge upload', () => {
  let documentId = '';

  it('admin uploads a TXT file: 201, READY, chunks stored with 768-dim embeddings', async () => {
    const res = await upload(adminToken, `shipping-${RUN}.txt`, POLICY_TEXT);

    expect(res.status).toBe(201);
    expect(res.body.document).toMatchObject({ status: 'READY', chunkCount: 1 });
    documentId = res.body.document.id;

    const rows = await prisma.$queryRaw<Array<{ dims: number; content: string }>>`
      SELECT vector_dims(embedding) AS dims, content
      FROM document_chunks WHERE document_id = ${documentId}::uuid`;
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.dims)).toBe(768);
    expect(rows[0]!.content).toContain('dispatched within 2 business days');
  });

  it('admin uploads an MD file', async () => {
    const res = await upload(
      adminToken,
      `faq-${RUN}.md`,
      `# FAQ\n\nGift cards never expire. (${RUN})`,
    );

    expect(res.status).toBe(201);
    expect(res.body.document.status).toBe('READY');
  });

  it('rejects the same file uploaded again with 409 DUPLICATE_DOCUMENT', async () => {
    const res = await upload(adminToken, `shipping-copy-${RUN}.txt`, POLICY_TEXT);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_DOCUMENT');
    expect(res.body.details.documentId).toBe(documentId);
  });

  it('lists and shows the document, then an ADMIN can delete it', async () => {
    const extra = await upload(adminToken, `delete-me-${RUN}.txt`, `Temporary ${RUN}`);
    const extraId = extra.body.document.id as string;

    const list = await request(app)
      .get('/api/knowledge/documents')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.documents.map((d: { id: string }) => d.id)).toContain(extraId);

    const one = await request(app)
      .get(`/api/knowledge/documents/${extraId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(one.body.document).toMatchObject({ status: 'READY', chunkCount: 1 });
    expect(one.body.document).not.toHaveProperty('content');

    const del = await request(app)
      .delete(`/api/knowledge/documents/${extraId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(200);
    expect(await prisma.documentChunk.count({ where: { documentId: extraId } })).toBe(0);
  });

  it('the uploaded document is retrievable through search', async () => {
    const res = await request(app)
      .post('/api/knowledge/search')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ query: 'How fast are orders dispatched?', topK: 3 });

    expect(res.status).toBe(200);
    expect(res.body.results[0].documentId).toBe(documentId);
  });

  it('rejects an unsupported file type with 400 UNSUPPORTED_FILE_TYPE', async () => {
    const res = await upload(adminToken, 'malware.exe', 'MZ fake binary');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('rejects a file over 10 MB with 400 UPLOAD_ERROR', async () => {
    const res = await upload(adminToken, 'big.txt', Buffer.alloc(10 * 1024 * 1024 + 1, 'a'));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UPLOAD_ERROR');
  });

  it('rejects an empty document with 400 EMPTY_DOCUMENT and stores nothing', async () => {
    const before = await prisma.knowledgeDocument.count();
    const res = await upload(adminToken, 'empty.txt', '   \n  ');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EMPTY_DOCUMENT');
    expect(await prisma.knowledgeDocument.count()).toBe(before);
  });

  it('rejects a corrupt PDF with 400 UNREADABLE_DOCUMENT', async () => {
    const res = await upload(adminToken, 'broken.pdf', 'this is not really a pdf');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNREADABLE_DOCUMENT');
  });

  it('rejects a request without a file with 400', async () => {
    const res = await request(app)
      .post('/api/knowledge/upload')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  it('rejects upload without a token (401) and from a CUSTOMER (403)', async () => {
    expect((await upload(undefined, 'x.txt', 'hello')).status).toBe(401);
    expect((await upload(customerToken, 'x.txt', 'hello')).status).toBe(403);
  });

  it('upload response does not expose text, chunks, or embeddings', async () => {
    const res = await upload(
      adminToken,
      `exposure-${RUN}.txt`,
      `Returns are accepted within 30 days. (${RUN})`,
    );

    expect(Object.keys(res.body.document).sort()).toEqual(['chunkCount', 'id', 'status', 'title']);
  });
});

describe('AI chat (real Ollama)', () => {
  it('answers a supported question with source metadata and no chunk text or embeddings', async () => {
    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ question: 'How many business days does dispatch take?' });

    expect(res.status).toBe(200);
    expect(res.body.answer).toMatch(/\b2\b|two/i);
    expect(res.body.sources.length).toBeGreaterThan(0);
    for (const source of res.body.sources) {
      expect(source).not.toHaveProperty('content');
      expect(source).not.toHaveProperty('embedding');
    }
  });

  it('returns the fixed no-evidence answer for an off-topic question', async () => {
    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ question: 'What is the capital of Australia?' });

    expect(res.status).toBe(200);
    expect(res.body.answer).toMatch(/couldn't find enough relevant information/);
    expect(res.body.sources).toEqual([]);
  });

  it.each([[{ question: '' }], [{ question: '   ' }], [{}], [{ question: 42 }]])(
    'rejects invalid payload %j with 400 VALIDATION_ERROR',
    async (body) => {
      const res = await request(app)
        .post('/api/chat')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(body);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    },
  );

  it('requires authentication', async () => {
    expect((await request(app).post('/api/chat').send({ question: 'hi' })).status).toBe(401);
  });
});

describe('Auth edge cases', () => {
  it('rejects the access token of a user who has been deleted', async () => {
    const temp = await createUser('CUSTOMER');
    await prisma.user.delete({ where: { id: temp.user.id } });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${temp.accessToken}`);
    expect(res.status).toBe(401);
  });

  it("reusing a rotated refresh token revokes all of that user's sessions", async () => {
    const first = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: customerRefreshToken });
    expect(first.status).toBe(200);

    const reuse = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: customerRefreshToken });
    expect(reuse.status).toBe(401);

    const newest = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: first.body.refreshToken });
    expect(newest.status).toBe(401);
  });
});

describe('Request safety', () => {
  it('rejects malformed JSON with a 400, not a 500', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "a@b.c", ');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects a body over 100 KB with 413, not a 500', async () => {
    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ question: 'a'.repeat(120 * 1024) });

    expect(res.status).toBe(413);
    expect(res.body.success).toBe(false);
  });

  it('error responses never include stack traces or internal details', async () => {
    const res = await upload(adminToken, 'empty2.txt', '');

    expect(JSON.stringify(res.body)).not.toMatch(/at \w+ \(|node_modules|\.ts:\d+|prisma/i);
  });

  it('a CUSTOMER cannot read raw chunk text through /api/knowledge/search', async () => {
    const res = await request(app)
      .post('/api/knowledge/search')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ query: 'shipping' });

    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty('results');
  });

  it('sets security headers on API responses', async () => {
    const res = await request(app).get('/api/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
