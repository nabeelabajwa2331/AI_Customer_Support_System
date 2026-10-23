import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOllamaClient } from '../src/ai/ollama.client.js';

const BASE_URL = 'http://localhost:11434';
const MODEL = 'embeddinggemma';
const DIMENSIONS = 768;

function createEmbedding(): number[] {
  return Array.from({ length: DIMENSIONS }, (_, index) => index / DIMENSIONS);
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createOllamaClient', () => {
  it('posts a single input to Ollama and returns the 768-dimensional embedding', async () => {
    const embedding = createEmbedding();
    const fetchMock = vi.fn(async () => jsonResponse({ embeddings: [embedding] }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createOllamaClient({ baseUrl: `${BASE_URL}/` });
    const result = await client.embed('  reset password  ', {
      model: MODEL,
      dimensions: DIMENSIONS,
    });

    expect(result).toEqual(embedding);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/embed`,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          input: 'reset password',
        }),
      }),
    );
  });

  it('rejects empty input without calling Ollama', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ embeddings: [createEmbedding()] }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createOllamaClient({ baseUrl: BASE_URL });

    await expect(
      client.embed('   ', { model: MODEL, dimensions: DIMENSIONS }),
    ).rejects.toThrow('Cannot generate an embedding for empty text.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a vector with the wrong number of dimensions', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ embeddings: [new Array<number>(1536).fill(0)] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = createOllamaClient({ baseUrl: BASE_URL });

    await expect(
      client.embed('reset password', { model: MODEL, dimensions: DIMENSIONS }),
    ).rejects.toThrow('expected 768');
  });

  it('rejects non-numeric values returned by Ollama', async () => {
    const embedding: unknown[] = createEmbedding();
    embedding[0] = 'not-a-number';

    const fetchMock = vi.fn(async () => jsonResponse({ embeddings: [embedding] }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createOllamaClient({ baseUrl: BASE_URL });

    await expect(
      client.embed('reset password', { model: MODEL, dimensions: DIMENSIONS }),
    ).rejects.toThrow('non-numeric embedding value');
  });

  it('reports an HTTP error with the Ollama response body', async () => {
    const fetchMock = vi.fn(async () =>
      new Response('model "embeddinggemma" not found', {
        status: 404,
        statusText: 'Not Found',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = createOllamaClient({ baseUrl: BASE_URL });

    await expect(
      client.embed('reset password', { model: MODEL, dimensions: DIMENSIONS }),
    ).rejects.toThrow('HTTP 404 Not Found: model "embeddinggemma" not found');
  });

  it('reports an unreachable Ollama server clearly', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createOllamaClient({ baseUrl: BASE_URL });

    await expect(
      client.embed('reset password', { model: MODEL, dimensions: DIMENSIONS }),
    ).rejects.toThrow(
      `Could not reach Ollama at ${BASE_URL}: fetch failed. Is the server running?`,
    );
  });

  it('reports a timeout when Ollama does not respond', async () => {
    const fetchMock = vi.fn(
      (...args: Parameters<typeof fetch>) =>
        new Promise<Response>((_resolve, reject) => {
          args[1]?.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = createOllamaClient({ baseUrl: BASE_URL, timeoutMs: 10 });

    await expect(
      client.embed('reset password', { model: MODEL, dimensions: DIMENSIONS }),
    ).rejects.toThrow('did not respond within 10ms');
  });

  it('rejects malformed JSON from Ollama', async () => {
    const fetchMock = vi.fn(async () =>
      new Response('not json', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = createOllamaClient({ baseUrl: BASE_URL });

    await expect(
      client.embed('reset password', { model: MODEL, dimensions: DIMENSIONS }),
    ).rejects.toThrow('invalid JSON response');
  });

  it('rejects a response with no embedding data', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ embeddings: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createOllamaClient({ baseUrl: BASE_URL });

    await expect(
      client.embed('reset password', { model: MODEL, dimensions: DIMENSIONS }),
    ).rejects.toThrow('no embedding data');
  });
});
