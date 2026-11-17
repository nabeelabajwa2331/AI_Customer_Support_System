import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.AUTH_SECRET ??= 'test-only-auth-secret-do-not-use-in-production-0123456789';

const { createUserRateLimiter } = await import('../src/middleware/rateLimits.js');

function makeApp(limit: number) {
  const app = express();
  // Stand-in for `authenticate`: the user id comes from a header.
  app.use((req, _res, next) => {
    const id = req.header('x-user');
    if (id) req.user = { id, email: `${id}@example.com`, role: 'CUSTOMER' };
    next();
  });
  app.post(
    '/limited',
    createUserRateLimiter({ windowMs: 60_000, limit, message: 'Slow down.', skip: false }),
    (_req, res) => {
      res.json({ ok: true });
    },
  );
  return app;
}

describe('createUserRateLimiter', () => {
  it('returns 429 RATE_LIMITED once a user exceeds the limit', async () => {
    const app = makeApp(2);

    expect((await request(app).post('/limited').set('x-user', 'u1')).status).toBe(200);
    expect((await request(app).post('/limited').set('x-user', 'u1')).status).toBe(200);

    const blocked = await request(app).post('/limited').set('x-user', 'u1');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ success: false, code: 'RATE_LIMITED', message: 'Slow down.' });
  });

  it('counts each user separately, even from the same IP address', async () => {
    const app = makeApp(1);

    expect((await request(app).post('/limited').set('x-user', 'u1')).status).toBe(200);
    expect((await request(app).post('/limited').set('x-user', 'u1')).status).toBe(429);
    expect((await request(app).post('/limited').set('x-user', 'u2')).status).toBe(200);
  });
});
