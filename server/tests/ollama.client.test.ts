import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOllamaClient, type OllamaChatMessage } from '../src/ai/ollama.client.js';

const BASE_URL = 'http://localhost:11434';
const MODEL = 'embeddinggemma';
const DIMENSIONS = 768;
const CHAT_MODEL = 'qwen2.5:3b';

function createEmbedding(): number[] {
  return Array.from({ length: DIMENSIONS }, (_, index) => index / DIMENSIONS);
}

function createChatMessages(): OllamaChatMessage[] {
  return [
    { role: 'system', content: 'You are a customer support assistant.' },
    { role: 'user', content: 'How do I reset my password?' },
    { role: 'assistant', content: 'Open account settings.' },
  ];
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

    await expect(client.embed('   ', { model: MODEL, dimensions: DIMENSIONS })).rejects.toThrow(
      'Cannot generate an embedding for empty text.',
    );
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
    const fetchMock = vi.fn(
      async () =>
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
    const fetchMock = vi.fn(
      async () =>
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

describe('createOllamaClient chat', () => {
  it('posts a non-streaming chat request and returns the assistant message', async () => {
    const messages = createChatMessages();
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        message: { role: 'assistant', content: 'Open account settings.' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = createOllamaClient({ baseUrl: `${BASE_URL}/` });
    const result = await client.chat({ model: ` ${CHAT_MODEL} `, messages });

    expect(result).toBe('Open account settings.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/chat`,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages,
          stream: false,
        }),
      }),
    );
  });

  it('sends a provided temperature as an Ollama model option', async () => {
    const messages = createChatMessages();
    const fetchMock = vi.fn(async () =>
      jsonResponse({ message: { role: 'assistant', content: 'ok' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = createOllamaClient({ baseUrl: BASE_URL });
    await client.chat({ model: CHAT_MODEL, messages, temperature: 0 });

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/chat`,
      expect.objectContaining({
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages,
          stream: false,
          options: { temperature: 0 },
        }),
      }),
    );
  });

  it.each([-0.1, Number.NaN, Number.POSITIVE_INFINITY, '0'])(
    'rejects an invalid temperature without calling Ollama: %j',
    async (temperature) => {
      const fetchMock = vi.fn(async () => jsonResponse({}));
      vi.stubGlobal('fetch', fetchMock);

      const client = createOllamaClient({ baseUrl: BASE_URL });

      await expect(
        client.chat({
          model: CHAT_MODEL,
          messages: createChatMessages(),
          temperature: temperature as number,
        }),
      ).rejects.toThrow('Chat temperature must be a non-negative finite number.');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(['', '   ', 42, null])('rejects an invalid model: %j', async (model) => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const client = createOllamaClient({ baseUrl: BASE_URL });

    await expect(
      client.chat({ model: model as string, messages: createChatMessages() }),
    ).rejects.toThrow('An Ollama chat model is required.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an empty message array', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const client = createOllamaClient({ baseUrl: BASE_URL });

    await expect(client.chat({ model: CHAT_MODEL, messages: [] })).rejects.toThrow(
      'At least one chat message is required.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a non-array message collection', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const client = createOllamaClient({ baseUrl: BASE_URL });

    await expect(
      client.chat({
        model: CHAT_MODEL,
        messages: undefined as unknown as OllamaChatMessage[],
      }),
    ).rejects.toThrow('At least one chat message is required.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ role: 'tool', content: 'Invalid role' }, 'has an invalid role'],
    [null, 'must be an object'],
    [{ role: 'user', content: '' }, 'must have non-empty content'],
    [{ role: 'user', content: '   ' }, 'must have non-empty content'],
    [{ role: 'user', content: 42 }, 'must have non-empty content'],
  ])('rejects an invalid chat message: %j', async (message, expectedMessage) => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const client = createOllamaClient({ baseUrl: BASE_URL });

    await expect(
      client.chat({
        model: CHAT_MODEL,
        messages: [message] as unknown as OllamaChatMessage[],
      }),
    ).rejects.toThrow(expectedMessage);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON from Ollama', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('not json', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = createOllamaClient({ baseUrl: BASE_URL });

    await expect(
      client.chat({ model: CHAT_MODEL, messages: createChatMessages() }),
    ).rejects.toThrow('invalid JSON response');
  });

  it.each([
    {},
    { message: null },
    { message: {} },
    { message: { role: 'assistant', content: 42 } },
  ])('rejects a malformed chat response: %j', async (payload) => {
    const fetchMock = vi.fn(async () => jsonResponse(payload));
    vi.stubGlobal('fetch', fetchMock);

    const client = createOllamaClient({ baseUrl: BASE_URL });

    await expect(
      client.chat({ model: CHAT_MODEL, messages: createChatMessages() }),
    ).rejects.toThrow('no chat message content');
  });

  it('reports an HTTP error with the Ollama response body', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('model "qwen2.5:3b" not found', {
          status: 404,
          statusText: 'Not Found',
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = createOllamaClient({ baseUrl: BASE_URL });

    await expect(
      client.chat({ model: CHAT_MODEL, messages: createChatMessages() }),
    ).rejects.toThrow(
      'Ollama chat request failed with HTTP 404 Not Found: model "qwen2.5:3b" not found',
    );
  });

  it('reports an unreachable Ollama server clearly', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createOllamaClient({ baseUrl: BASE_URL });

    await expect(
      client.chat({ model: CHAT_MODEL, messages: createChatMessages() }),
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
      client.chat({ model: CHAT_MODEL, messages: createChatMessages() }),
    ).rejects.toThrow('did not respond within 10ms');
  });

  it('keeps the timeout active while reading the response body', async () => {
    const fetchMock = vi.fn((...args: Parameters<typeof fetch>) =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () =>
          new Promise<unknown>((_resolve, reject) => {
            args[1]?.signal?.addEventListener('abort', () => {
              reject(new Error('aborted'));
            });
          }),
      } as Response),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = createOllamaClient({ baseUrl: BASE_URL, timeoutMs: 10 });

    await expect(
      client.chat({ model: CHAT_MODEL, messages: createChatMessages() }),
    ).rejects.toThrow('did not respond within 10ms');
  });
});
