import { config } from '../config/env.js';
import { createOllamaClient } from './ollama.client.js';
import type { OllamaClient } from './ollama.client.js';
import { createOpenAICompatibleClient } from './openai-compatible.client.js';

/** Client used for chat generation, per CHAT_PROVIDER. */
export function createChatClient(): Pick<OllamaClient, 'chat'> {
  if (config.chatProvider === 'openai-compatible') {
    return createOpenAICompatibleClient({
      baseUrl: config.chatApi.baseUrl,
      apiKey: config.chatApi.apiKey!,
      timeoutMs: config.chatApi.timeoutMs,
    });
  }

  return createOllamaClient({
    baseUrl: config.ollamaBaseUrl,
    timeoutMs: config.ollamaChatTimeoutMs,
  });
}

/** Client used for embeddings, per EMBEDDING_PROVIDER. */
export function createEmbeddingClient(): Pick<OllamaClient, 'embed'> {
  if (config.embeddingProvider === 'openai-compatible') {
    return createOpenAICompatibleClient({
      baseUrl: config.embeddingApi.baseUrl,
      apiKey: config.embeddingApi.apiKey!,
      timeoutMs: config.embeddingApi.timeoutMs,
      sendEmbeddingDimensions: config.embeddingApi.sendDimensions,
    });
  }

  return createOllamaClient({ baseUrl: config.ollamaBaseUrl, timeoutMs: config.ollamaTimeoutMs });
}
