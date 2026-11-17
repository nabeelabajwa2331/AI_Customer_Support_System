import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { resetDatabase } from './helpers/db.js';

const app = createApp();
const USER = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'OriginalPass123' };

beforeEach(resetDatabase);
afterAll(async () => {
  await prisma.$disconnect();
});

async function signedIn() {
  await request(app).post('/api/auth/register').send(USER);
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: USER.email, password: USER.password });
  return { access: res.body.accessToken as string, refresh: res.body.refreshToken as string };
}

describe('PATCH /api/auth/me', () => {
  it('updates and trims the display name', async () => {
    const { access } = await signedIn();

    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${access}`)
      .send({ name: '  Ada King  ' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Ada King', email: USER.email, role: 'CUSTOMER' });
  });

  it('ignores attempts to change email or role', async () => {
    const { access } = await signedIn();

    await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${access}`)
      .send({ name: 'Ada', email: 'evil@example.com', role: 'ADMIN' });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: USER.email } });
    expect(user.role).toBe('CUSTOMER');
  });

  it('rejects an empty name and requires authentication', async () => {
    const { access } = await signedIn();

    const empty = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${access}`)
      .send({ name: '  ' });
    expect(empty.status).toBe(400);

    expect((await request(app).patch('/api/auth/me').send({ name: 'X' })).status).toBe(401);
  });
});

describe('POST /api/auth/change-password', () => {
  it('rejects a wrong current password without changing anything', async () => {
    const { access } = await signedIn();

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${access}`)
      .send({ currentPassword: 'WrongPass123', newPassword: 'BrandNewPass456' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CURRENT_PASSWORD');
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: USER.email, password: USER.password });
    expect(login.status).toBe(200);
  });

  it('rejects reusing the current password and a too-short new password', async () => {
    const { access } = await signedIn();

    const same = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${access}`)
      .send({ currentPassword: USER.password, newPassword: USER.password });
    expect(same.body.code).toBe('PASSWORD_UNCHANGED');

    const short = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${access}`)
      .send({ currentPassword: USER.password, newPassword: 'short' });
    expect(short.status).toBe(400);
    expect(short.body.code).toBe('VALIDATION_ERROR');
  });

  it('changes the password, signs out other sessions, and returns a new session', async () => {
    const first = await signedIn();
    const otherDevice = await request(app)
      .post('/api/auth/login')
      .send({ email: USER.email, password: USER.password });

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${first.access}`)
      .send({ currentPassword: USER.password, newPassword: 'BrandNewPass456' });

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toEqual(expect.any(String));

    // Other sessions can no longer refresh.
    const stale = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: otherDevice.body.refreshToken });
    expect(stale.status).toBe(401);

    // The session returned by the change keeps working.
    const fresh = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: res.body.refreshToken });
    expect(fresh.status).toBe(200);

    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ email: USER.email, password: USER.password })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ email: USER.email, password: 'BrandNewPass456' })
      ).status,
    ).toBe(200);
  });
});
