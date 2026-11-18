import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOpenAICompatibleClient } from '../src/ai/openai-compatible.client.js';

const BASE = 'https://api.example.test/v1';
const KEY = 'gsk_test_key_1234567890';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createOpenAICompatibleClient', () => {
  it('rejects missing configuration', () => {
    expect(() => createOpenAICompatibleClient({ baseUrl: '', apiKey: KEY })).toThrow(/base URL/);
    expect(() => createOpenAICompatibleClient({ baseUrl: BASE, apiKey: ' ' })).toThrow(/key/);
  });

  it('chat: posts to /chat/completions with the bearer key and returns the message', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        json(200, { choices: [{ message: { role: 'assistant', content: 'Hello!' } }] }),
      );
    const client = createOpenAICompatibleClient({ baseUrl: `${BASE}/`, apiKey: KEY });

    const answer = await client.chat({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: 'Hi' }],
      temperature: 0,
    });

    expect(answer).toBe('Hello!');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE}/chat/completions`);
    expect(new Headers(init!.headers).get('Authorization')).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(init!.body as string)).toMatchObject({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: 'Hi' }],
      temperature: 0,
    });
  });

  it('embed: requests 768 dimensions and validates the vector', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(json(200, { data: [{ embedding: new Array(768).fill(0.1) }] }));
    const client = createOpenAICompatibleClient({ baseUrl: BASE, apiKey: KEY });

    const vector = await client.embed('refund policy', {
      model: 'gemini-embedding-001',
      dimensions: 768,
    });

    expect(vector).toHaveLength(768);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE}/embeddings`);
    expect(JSON.parse(init!.body as string)).toEqual({
      model: 'gemini-embedding-001',
      input: 'refund policy',
      dimensions: 768,
    });
  });

  it('embed: can omit the dimensions parameter', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(json(200, { data: [{ embedding: new Array(768).fill(0) }] }));
    const client = createOpenAICompatibleClient({
      baseUrl: BASE,
      apiKey: KEY,
      sendEmbeddingDimensions: false,
    });

    await client.embed('x', { model: 'm', dimensions: 768 });

    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).not.toHaveProperty(
      'dimensions',
    );
  });

  it('embed: rejects a vector of the wrong size (would not fit vector(768))', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json(200, { data: [{ embedding: new Array(3072).fill(0) }] }),
    );
    const client = createOpenAICompatibleClient({ baseUrl: BASE, apiKey: KEY });

    await expect(client.embed('x', { model: 'm', dimensions: 768 })).rejects.toThrow(
      /3072 dimensions; expected 768/,
    );
  });

  it('never includes the API key in error messages', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(`{"error":"invalid key ${KEY}"}`, { status: 401 }),
    );
    const client = createOpenAICompatibleClient({ baseUrl: BASE, apiKey: KEY });

    const error = await client
      .chat({ model: 'm', messages: [{ role: 'user', content: 'x' }] })
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/HTTP 401/);
    expect((error as Error).message).not.toContain(KEY);
  });

  it('reports a timeout clearly', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const client = createOpenAICompatibleClient({ baseUrl: BASE, apiKey: KEY, timeoutMs: 20 });

    await expect(
      client.chat({ model: 'm', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow(/did not respond within 20ms/);
  });
});
