import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cors } from '../src/middleware/cors.js';

const KEYS = [
  'DATABASE_URL',
  'AUTH_SECRET',
  'CHAT_PROVIDER',
  'CHAT_API_KEY',
  'EMBEDDING_PROVIDER',
  'EMBEDDING_API_KEY',
  'CORS_ORIGINS',
  'TRUST_PROXY',
] as const;
const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  for (const key of KEYS) delete process.env[key];
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.AUTH_SECRET = 'test-only-auth-secret-do-not-use-in-production-0123456789';
  vi.resetModules();
});

afterEach(() => {
  for (const key of KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
  vi.resetModules();
});

const loadConfig = async () => (await import('../src/config/env.js')).config;

describe('AI provider configuration', () => {
  it('defaults to local Ollama for both chat and embeddings', async () => {
    const config = await loadConfig();

    expect(config.chatProvider).toBe('ollama');
    expect(config.embeddingProvider).toBe('ollama');
    expect(config.chatModel).toBe(config.ollamaChatModel);
    expect(config.embeddingModel).toBe(config.ollamaEmbeddingModel);
    expect(config.corsOrigins).toEqual([]);
    expect(config.trustProxy).toBe(0);
  });

  it('uses the hosted models (Groq chat, Gemini embeddings) when configured', async () => {
    process.env.CHAT_PROVIDER = 'openai-compatible';
    process.env.CHAT_API_KEY = 'gsk_x';
    process.env.EMBEDDING_PROVIDER = 'openai-compatible';
    process.env.EMBEDDING_API_KEY = 'AIza_x';

    const config = await loadConfig();

    expect(config.chatModel).toBe('llama-3.1-8b-instant');
    expect(config.chatApi.baseUrl).toBe('https://api.groq.com/openai/v1');
    expect(config.embeddingModel).toBe('gemini-embedding-001');
    expect(config.embeddingApi.baseUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai',
    );
    expect(config.embeddingApi.sendDimensions).toBe(true);
  });

  it.each([
    ['CHAT_PROVIDER', 'CHAT_API_KEY'],
    ['EMBEDDING_PROVIDER', 'EMBEDDING_API_KEY'],
  ])('fails at startup when %s is hosted but %s is missing', async (providerKey, apiKey) => {
    process.env[providerKey] = 'openai-compatible';

    await expect(loadConfig()).rejects.toThrow(new RegExp(apiKey));
  });

  it('rejects an unknown provider', async () => {
    process.env.CHAT_PROVIDER = 'magic';
    await expect(loadConfig()).rejects.toThrow(/CHAT_PROVIDER/);
  });

  it('parses CORS_ORIGINS and rejects paths or junk', async () => {
    process.env.CORS_ORIGINS = 'https://support.vercel.app/, http://localhost:5173';
    expect((await loadConfig()).corsOrigins).toEqual([
      'https://support.vercel.app',
      'http://localhost:5173',
    ]);

    vi.resetModules();
    process.env.CORS_ORIGINS = 'https://support.vercel.app/app';
    await expect(loadConfig()).rejects.toThrow(/CORS_ORIGINS/);
  });
});

describe('cors middleware', () => {
  const app = express();
  app.use(cors(['https://support.vercel.app']));
  app.get('/api/x', (_req, res) => {
    res.json({ ok: true });
  });

  it('allows a listed origin and answers its preflight', async () => {
    const preflight = await request(app)
      .options('/api/x')
      .set('Origin', 'https://support.vercel.app')
      .set('Access-Control-Request-Method', 'POST');

    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('https://support.vercel.app');
    expect(preflight.headers['access-control-allow-headers']).toContain('Authorization');

    const get = await request(app).get('/api/x').set('Origin', 'https://support.vercel.app');
    expect(get.headers['access-control-allow-origin']).toBe('https://support.vercel.app');
    expect(get.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('gives no CORS headers to other origins', async () => {
    const res = await request(app).get('/api/x').set('Origin', 'https://evil.example');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
