import type { Role } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { resetDatabase } from './helpers/db.js';

const app = createApp();
const PASSWORD = 'CorrectHorse123';

beforeEach(resetDatabase);
afterAll(async () => {
  await prisma.$disconnect();
});

/** Creates an account with `role` and returns its id and an access token. */
async function account(name: string, role: Role) {
  const email = `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`;
  await request(app).post('/api/auth/register').send({ name, email, password: PASSWORD });
  const user = await prisma.user.update({ where: { email }, data: { role } });
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { id: user.id, email, token: login.body.accessToken as string };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('GET /api/admin/users', () => {
  it('lists users with role counts and never returns password hashes', async () => {
    const admin = await account('Ada Admin', 'ADMIN');
    await account('Carl Customer', 'CUSTOMER');
    await account('Sam Agent', 'SUPPORT_AGENT');

    const res = await request(app).get('/api/admin/users').set(auth(admin.token));

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.roleCounts).toEqual({ CUSTOMER: 1, SUPPORT_AGENT: 1, ADMIN: 1 });
    expect(res.body.users[0]).toMatchObject({ questionCount: 0, documentCount: 0 });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('filters by role and searches name or email, case-insensitively', async () => {
    const admin = await account('Ada Admin', 'ADMIN');
    await account('Carl Customer', 'CUSTOMER');
    await account('Cora Customer', 'CUSTOMER');

    const byRole = await request(app).get('/api/admin/users?role=CUSTOMER').set(auth(admin.token));
    expect(byRole.body.total).toBe(2);

    const bySearch = await request(app).get('/api/admin/users?search=CORA').set(auth(admin.token));
    expect(bySearch.body.users.map((u: { name: string }) => u.name)).toEqual(['Cora Customer']);
  });

  it('rejects invalid query values', async () => {
    const admin = await account('Ada Admin', 'ADMIN');
    const res = await request(app).get('/api/admin/users?role=SUPERUSER').set(auth(admin.token));
    expect(res.status).toBe(400);
  });

  it.each(['CUSTOMER', 'SUPPORT_AGENT'] as const)('is forbidden for %s', async (role) => {
    const user = await account('Some User', role);
    const res = await request(app).get('/api/admin/users').set(auth(user.token));
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/admin/users/:id', () => {
  it('promotes a customer, and the new role applies immediately', async () => {
    const admin = await account('Ada Admin', 'ADMIN');
    const customer = await account('Carl Customer', 'CUSTOMER');

    // Before: the customer cannot read the knowledge base.
    expect((await request(app).get('/api/knowledge/documents').set(auth(customer.token))).status).toBe(403);

    const res = await request(app)
      .patch(`/api/admin/users/${customer.id}`)
      .set(auth(admin.token))
      .send({ role: 'SUPPORT_AGENT' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('SUPPORT_AGENT');
    // Same access token, new permissions: authentication reads the role from the database.
    expect((await request(app).get('/api/knowledge/documents').set(auth(customer.token))).status).toBe(200);
  });

  it('refuses to change your own role', async () => {
    const admin = await account('Ada Admin', 'ADMIN');
    const res = await request(app)
      .patch(`/api/admin/users/${admin.id}`)
      .set(auth(admin.token))
      .send({ role: 'CUSTOMER' });

    expect(res.status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).role).toBe('ADMIN');
  });

  it('lets one admin demote another while two exist', async () => {
    const first = await account('Ada Admin', 'ADMIN');
    const second = await account('Bea Admin', 'ADMIN');

    const res = await request(app)
      .patch(`/api/admin/users/${second.id}`)
      .set(auth(first.token))
      .send({ role: 'SUPPORT_AGENT' });

    expect(res.status).toBe(200);
    expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBe(1);
  });

  it('returns 404 for an unknown user and 400 for an invalid role or id', async () => {
    const admin = await account('Ada Admin', 'ADMIN');

    const missing = await request(app)
      .patch('/api/admin/users/0f8fad5b-d9cb-469f-a165-70867728950e')
      .set(auth(admin.token))
      .send({ role: 'CUSTOMER' });
    expect(missing.status).toBe(404);

    const customer = await account('Carl Customer', 'CUSTOMER');
    const badRole = await request(app)
      .patch(`/api/admin/users/${customer.id}`)
      .set(auth(admin.token))
      .send({ role: 'OWNER' });
    expect(badRole.status).toBe(400);

    const badId = await request(app)
      .patch('/api/admin/users/not-a-uuid')
      .set(auth(admin.token))
      .send({ role: 'CUSTOMER' });
    expect(badId.status).toBe(400);
  });

  it('is forbidden for a support agent', async () => {
    const agent = await account('Sam Agent', 'SUPPORT_AGENT');
    const customer = await account('Carl Customer', 'CUSTOMER');

    const res = await request(app)
      .patch(`/api/admin/users/${customer.id}`)
      .set(auth(agent.token))
      .send({ role: 'ADMIN' });

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/admin/users/:id', () => {
  it('deletes the account and its sessions but keeps its question history anonymously', async () => {
    const admin = await account('Ada Admin', 'ADMIN');
    const customer = await account('Carl Customer', 'CUSTOMER');
    await prisma.chatLog.create({
      data: { userId: customer.id, question: 'Hello?', outcome: 'NO_EVIDENCE', latencyMs: 5 },
    });

    const res = await request(app).delete(`/api/admin/users/${customer.id}`).set(auth(admin.token));

    expect(res.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: customer.id } })).toBeNull();
    expect(await prisma.refreshToken.count({ where: { userId: customer.id } })).toBe(0);
    const log = await prisma.chatLog.findFirstOrThrow();
    expect(log.userId).toBeNull();
    // The deleted user's token stops working at once.
    expect((await request(app).get('/api/auth/me').set(auth(customer.token))).status).toBe(401);
  });

  it('refuses to delete yourself', async () => {
    const admin = await account('Ada Admin', 'ADMIN');
    const res = await request(app).delete(`/api/admin/users/${admin.id}`).set(auth(admin.token));

    expect(res.status).toBe(403);
    expect(await prisma.user.count()).toBe(1);
  });

  it('is forbidden for non-admins', async () => {
    const agent = await account('Sam Agent', 'SUPPORT_AGENT');
    const customer = await account('Carl Customer', 'CUSTOMER');

    const res = await request(app).delete(`/api/admin/users/${customer.id}`).set(auth(agent.token));

    expect(res.status).toBe(403);
    expect(await prisma.user.count()).toBe(2);
  });
});
