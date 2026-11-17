import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { chatMock, createOllamaClientMock, generateEmbeddingMock } = vi.hoisted(() => {
  const chatMock = vi.fn();
  const createOllamaClientMock = vi.fn(() => ({ chat: chatMock }));
  const generateEmbeddingMock = vi.fn();
  return { chatMock, createOllamaClientMock, generateEmbeddingMock };
});

vi.mock('../src/ai/ollama.client.js', () => ({ createOllamaClient: createOllamaClientMock }));
vi.mock('../src/knowledge/embedding.js', () => ({ generateEmbedding: generateEmbeddingMock }));
vi.mock('../src/config/env.js', () => ({
  config: {
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaChatModel: 'configured-chat-model',
    ollamaEmbeddingModel: 'configured-embedding-model',
    ollamaChatTimeoutMs: 120_000,
  },
}));

import { warmUpModels } from '../src/ai/warmup.js';

beforeEach(() => {
  chatMock.mockReset().mockResolvedValue('OK');
  generateEmbeddingMock.mockReset().mockResolvedValue([0.1]);
  createOllamaClientMock.mockClear();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('warmUpModels', () => {
  it('loads the embedding model and then the configured chat model with the chat timeout', async () => {
    const order: string[] = [];
    generateEmbeddingMock.mockImplementation(async () => {
      order.push('embedding');
      return [0.1];
    });
    chatMock.mockImplementation(async () => {
      order.push('chat');
      return 'OK';
    });

    await expect(warmUpModels()).resolves.toEqual({ embedding: true, chat: true });

    expect(order).toEqual(['embedding', 'chat']);
    expect(createOllamaClientMock).toHaveBeenCalledWith({
      baseUrl: 'http://localhost:11434',
      timeoutMs: 120_000,
    });
    expect(chatMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'configured-chat-model', temperature: 0 }),
    );
  });

  it('never throws and still warms the chat model when the embedding model fails', async () => {
    generateEmbeddingMock.mockRejectedValue(new Error('Could not reach Ollama'));

    await expect(warmUpModels()).resolves.toEqual({ embedding: false, chat: true });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Could not reach Ollama'));
  });

  it('never throws when the chat model fails to load', async () => {
    chatMock.mockRejectedValue(new Error('Ollama did not respond within 120000ms'));

    await expect(warmUpModels()).resolves.toEqual({ embedding: true, chat: false });
  });
});
