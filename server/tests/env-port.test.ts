import { afterEach, describe, expect, it, vi } from 'vitest';

const originalPort = process.env.PORT;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalAuthSecret = process.env.AUTH_SECRET;

afterEach(() => {
  if (originalPort === undefined) {
    delete process.env.PORT;
  } else {
    process.env.PORT = originalPort;
  }

  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }

  if (originalAuthSecret === undefined) {
    delete process.env.AUTH_SECRET;
  } else {
    process.env.AUTH_SECRET = originalAuthSecret;
  }

  vi.resetModules();
});

describe('environment configuration', () => {
  it('defaults the API port to 5001 when PORT is not set', async () => {
    delete process.env.PORT;
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    process.env.AUTH_SECRET = 'test-only-auth-secret-do-not-use-in-production-0123456789';
    vi.resetModules();

    const { config } = await import('../src/config/env.js');

    expect(config.port).toBe(5001);
  });
});
