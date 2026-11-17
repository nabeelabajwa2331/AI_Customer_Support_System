// Integration tests (TEST database). Google ID tokens are signed with a locally
// generated RSA key, so real signature, audience, issuer and expiry checks run
// without contacting Google.
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
vi.hoisted(() => {
  process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
});

import { createApp } from '../src/app.js';
import { hashPassword } from '../src/lib/password.js';
import { prisma } from '../src/lib/prisma.js';
import { loginWithGoogle } from '../src/services/auth.service.js';
import { resetDatabase } from './helpers/db.js';

const app = createApp();
let keys: JWTVerifyGetKey;
let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;

async function googleToken(
  claims: Record<string, unknown> = {},
  { audience = CLIENT_ID, expiresIn = '5m', key = privateKey } = {},
) {
  return new SignJWT({
    email: 'grace@example.com',
    email_verified: true,
    name: 'Grace Hopper',
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer('https://accounts.google.com')
    .setAudience(audience)
    .setSubject('google-sub-123')
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  otherPrivateKey = (await generateKeyPair('RS256')).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256' };
  keys = createLocalJWKSet({ keys: [jwk] });
});

beforeEach(resetDatabase);
afterAll(async () => {
  await prisma.$disconnect();
});

describe('loginWithGoogle', () => {
  it('creates a CUSTOMER for a new verified Google email and returns tokens', async () => {
    const result = await loginWithGoogle(await googleToken(), keys);

    expect(result.user).toMatchObject({
      email: 'grace@example.com',
      name: 'Grace Hopper',
      role: 'CUSTOMER',
    });
    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('signs in to the existing account with that email and keeps its role', async () => {
    await prisma.user.create({
      data: {
        name: 'Grace Admin',
        email: 'grace@example.com',
        passwordHash: await hashPassword('ExistingPass123'),
        role: 'ADMIN',
      },
    });

    const result = await loginWithGoogle(await googleToken({ email: 'Grace@Example.com' }), keys);

    expect(result.user).toMatchObject({ name: 'Grace Admin', role: 'ADMIN' });
    expect(await prisma.user.count()).toBe(1);
  });

  it('a Google-created account cannot be used with a guessed password', async () => {
    await loginWithGoogle(await googleToken(), keys);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'grace@example.com', password: 'anything-at-all' });
    expect(res.status).toBe(401);
  });

  it.each([
    ['an unverified email', () => googleToken({ email_verified: false })],
    [
      'a token for another app (wrong audience)',
      () => googleToken({}, { audience: 'other.apps.googleusercontent.com' }),
    ],
    ['an expired token', () => googleToken({}, { expiresIn: '-1m' })],
    ['a token signed by an unknown key', () => googleToken({}, { key: otherPrivateKey })],
  ])('rejects %s with 401 and creates no user', async (_label, makeToken) => {
    await expect(loginWithGoogle(await makeToken(), keys)).rejects.toMatchObject({ status: 401 });
    expect(await prisma.user.count()).toBe(0);
  });
});

describe('Google auth routes', () => {
  it('GET /api/auth/google/config exposes only whether it is enabled and the public client ID', async () => {
    const res = await request(app).get('/api/auth/google/config');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, enabled: true, clientId: CLIENT_ID });
  });

  it('POST /api/auth/google validates the payload', async () => {
    const res = await request(app).post('/api/auth/google').send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/auth/google rejects a malformed credential with 401', async () => {
    const res = await request(app).post('/api/auth/google').send({ credential: 'not-a-jwt' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Google sign-in failed');
  });
});
