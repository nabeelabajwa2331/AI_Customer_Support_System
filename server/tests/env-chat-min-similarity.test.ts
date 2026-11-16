import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEYS = ['CHAT_MIN_SIMILARITY', 'DATABASE_URL', 'AUTH_SECRET'] as const;
const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.AUTH_SECRET = 'test-only-auth-secret-do-not-use-in-production-0123456789';
  vi.resetModules();
});

afterEach(() => {
  for (const key of KEYS) {
    const value = original[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  vi.resetModules();
});

async function loadConfig() {
  const { config } = await import('../src/config/env.js');
  return config;
}

describe('CHAT_MIN_SIMILARITY configuration', () => {
  it('defaults to 0.40 when not set', async () => {
    delete process.env.CHAT_MIN_SIMILARITY;

    expect((await loadConfig()).chatMinSimilarity).toBe(0.4);
  });

  it('falls back to the default instead of 0 when set to an empty value', async () => {
    process.env.CHAT_MIN_SIMILARITY = '  ';

    expect((await loadConfig()).chatMinSimilarity).toBe(0.4);
  });

  it.each([
    ['0', 0],
    ['0.55', 0.55],
    ['1', 1],
  ])('accepts %s', async (raw, expected) => {
    process.env.CHAT_MIN_SIMILARITY = raw;

    expect((await loadConfig()).chatMinSimilarity).toBe(expected);
  });

  it.each(['-0.1', '1.01', '40', 'abc'])('rejects %s', async (raw) => {
    process.env.CHAT_MIN_SIMILARITY = raw;

    await expect(loadConfig()).rejects.toThrow(/CHAT_MIN_SIMILARITY/);
  });
});
