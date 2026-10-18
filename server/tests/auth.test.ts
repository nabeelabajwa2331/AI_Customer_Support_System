import type { Role } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { hashPassword } from '../src/lib/password.js';
import { prisma } from '../src/lib/prisma.js';
import { resetDatabase } from './helpers/db.js';

const app = createApp();

const VALID = { name: 'Ada Lovelace', email: 'Ada@Example.com', password: 'SuperSecret123' };

beforeEach(resetDatabase);
afterAll(async () => {
  await prisma.$disconnect();
});

async function register(overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/auth/register')
    .send({ ...VALID, ...overrides });
}

async function login(email: string, password: string) {
  return request(app).post('/api/auth/login').send({ email, password });
}

async function createUserWithRole(role: Role, email: string) {
  return prisma.user.create({
    data: { name: 'Staff User', email, passwordHash: await hashPassword('StaffPass123'), role },
  });
}

describe('POST /api/auth/register', () => {
  it('creates a CUSTOMER and never returns a password hash', async () => {
    const res = await register();

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user.role).toBe('CUSTOMER');
    expect(res.body.user.email).toBe('ada@example.com'); // normalized
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('stores the password only as a bcrypt hash', async () => {
    await register();

    const stored = await prisma.user.findUnique({ where: { email: 'ada@example.com' } });
    expect(stored).not.toBeNull();
    expect(stored!.passwordHash).not.toBe(VALID.password);
    expect(stored!.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt prefix
  });

  it('rejects a duplicate email (case-insensitive)', async () => {
    await register();
    const res = await register({ email: 'ada@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('ignores an attempted role escalation', async () => {
    const res = await register({ role: 'ADMIN' });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('CUSTOMER');
  });

  it('rejects invalid input safely', async () => {
    const badEmail = await register({ email: 'not-an-email' });
    expect(badEmail.status).toBe(400);
    expect(badEmail.body.success).toBe(false);

    const shortPassword = await register({ password: 'short' });
    expect(shortPassword.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await register();
  });

  it('returns tokens on valid credentials', async () => {
    const res = await login('ada@example.com', VALID.password);

    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.tokenType).toBe('Bearer');
    expect(res.body.user.email).toBe('ada@example.com');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('returns the same generic error for wrong password and unknown email', async () => {
    const wrongPassword = await login('ada@example.com', 'WrongPassword123');
    const unknownEmail = await login('nobody@example.com', 'WrongPassword123');

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    expect(wrongPassword.body.message).toBe('Invalid email or password');
  });
});

describe('GET /api/auth/me (protected)', () => {
  it('rejects requests without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a malformed token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  it('returns the current user for a valid token', async () => {
    await register();
    const { body } = await login('ada@example.com', VALID.password);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('ada@example.com');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });
});

describe('role-based authorization', () => {
  async function tokenFor(role: Role, email: string) {
    await createUserWithRole(role, email);
    const { body } = await login(email, 'StaffPass123');
    return body.accessToken as string;
  }

  it('forbids a CUSTOMER from an admin-only route', async () => {
    await register();
    const { body } = await login('ada@example.com', VALID.password);

    const res = await request(app)
      .get('/api/admin/ping')
      .set('Authorization', `Bearer ${body.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('forbids a SUPPORT_AGENT from an admin-only route', async () => {
    const token = await tokenFor('SUPPORT_AGENT', 'agent@example.com');
    const res = await request(app).get('/api/admin/ping').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('allows an ADMIN to reach the admin-only route', async () => {
    const token = await tokenFor('ADMIN', 'admin@example.com');
    const res = await request(app).get('/api/admin/ping').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('refresh and logout', () => {
  it('rotates the refresh token and rejects the old one', async () => {
    await register();
    const first = await login('ada@example.com', VALID.password);
    const oldRefresh = first.body.refreshToken as string;

    const rotated = await request(app).post('/api/auth/refresh').send({ refreshToken: oldRefresh });
    expect(rotated.status).toBe(200);
    expect(rotated.body.refreshToken).not.toBe(oldRefresh);

    const reuse = await request(app).post('/api/auth/refresh').send({ refreshToken: oldRefresh });
    expect(reuse.status).toBe(401);
  });

  it('invalidates the refresh token on logout', async () => {
    await register();
    const { body } = await login('ada@example.com', VALID.password);

    const logout = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: body.refreshToken });
    expect(logout.status).toBe(200);

    const afterLogout = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: body.refreshToken });
    expect(afterLogout.status).toBe(401);
  });
});
