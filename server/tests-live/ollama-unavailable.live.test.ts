// The app is loaded with OLLAMA_BASE_URL pointing at a closed port, to check
// how chat and upload behave when the model server is down. Uses the TEST database.
// All app modules are imported dynamically, after the override, because the
// config is read once at import time.
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

const RUN = `down-${Date.now()}`;
const PASSWORD = 'LiveTestPass123';
let app: Express;
let prisma: PrismaClient;
let adminToken = '';
const userIds: string[] = [];

beforeAll(async () => {
  process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:9';

  const { createApp } = await import('../src/app.js');
  const { hashPassword } = await import('../src/lib/password.js');
  ({ prisma } = await import('../src/lib/prisma.js'));
  app = createApp();

  const admin = await prisma.user.create({
    data: {
      name: `Admin ${RUN}`,
      email: `admin-${RUN}@example.test`,
      passwordHash: await hashPassword(PASSWORD),
      role: 'ADMIN',
    },
  });
  userIds.push(admin.id);

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: admin.email, password: PASSWORD });
  adminToken = res.body.accessToken;
});

afterAll(async () => {
  await prisma.knowledgeDocument.deleteMany({ where: { createdById: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('Ollama unavailable', () => {
  it('chat returns a safe 502 without leaking the Ollama URL or error detail', async () => {
    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ question: 'How long do refunds take?' });

    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/127\.0\.0\.1|11434|ECONNREFUSED|fetch failed/i);
  });

  it('upload fails with a safe 5xx and stores no document', async () => {
    const before = await prisma.knowledgeDocument.count();

    const res = await request(app)
      .post('/api/knowledge/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from('Refunds take 5 days.'), `down-${RUN}.txt`);

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(JSON.stringify(res.body)).not.toMatch(/127\.0\.0\.1|ECONNREFUSED|fetch failed/i);
    expect(await prisma.knowledgeDocument.count()).toBe(before);
  });
});
