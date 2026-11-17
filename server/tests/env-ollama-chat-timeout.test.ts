import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEYS = [
  'OLLAMA_CHAT_TIMEOUT_MS',
  'OLLAMA_TIMEOUT_MS',
  'DATABASE_URL',
  'AUTH_SECRET',
] as const;
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

describe('OLLAMA_CHAT_TIMEOUT_MS configuration', () => {
  it('defaults to 120000ms, independent of the embedding timeout', async () => {
    delete process.env.OLLAMA_CHAT_TIMEOUT_MS;
    process.env.OLLAMA_TIMEOUT_MS = '30000';

    const config = await loadConfig();

    expect(config.ollamaChatTimeoutMs).toBe(120_000);
    expect(config.ollamaTimeoutMs).toBe(30_000);
  });

  it('accepts a configured value', async () => {
    process.env.OLLAMA_CHAT_TIMEOUT_MS = '90000';

    expect((await loadConfig()).ollamaChatTimeoutMs).toBe(90_000);
  });

  it.each(['0', '300001', 'abc', '1.5'])('rejects %s', async (raw) => {
    process.env.OLLAMA_CHAT_TIMEOUT_MS = raw;

    await expect(loadConfig()).rejects.toThrow(/OLLAMA_CHAT_TIMEOUT_MS/);
  });
});
