// Client for any OpenAI-compatible API (Groq, Gemini's OpenAI endpoint,
// OpenAI, Together, OpenRouter, ...). Same interface as the Ollama client, so
// the rest of the app does not care which provider is configured.
import type { OllamaChatOptions, OllamaClient, OllamaEmbeddingOptions } from './ollama.client.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const ERROR_BODY_LIMIT = 300;
const MAX_ANSWER_TOKENS = 600;

export interface OpenAICompatibleOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  /** Send `dimensions` with embedding requests (needed to get 768-dim vectors). */
  sendEmbeddingDimensions?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Strips anything that looks like a key so provider errors are safe to log. */
function redact(text: string): string {
  return text.replace(/(sk|gsk|AIza)[-_A-Za-z0-9]{8,}/g, '[redacted]');
}

export function createOpenAICompatibleClient({
  baseUrl,
  apiKey,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  sendEmbeddingDimensions = true,
}: OpenAICompatibleOptions): OllamaClient {
  const root = baseUrl.trim().replace(/\/+$/, '');
  if (!root) throw new Error('AI API base URL must not be empty.');
  if (!apiKey.trim()) throw new Error('AI API key must not be empty.');
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0)
    throw new Error('AI API timeout must be a positive integer.');

  async function post(path: string, body: unknown, label: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;

    try {
      response = await fetch(`${root}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error(`${label} did not respond within ${timeoutMs}ms.`);
      throw new Error(
        `Could not reach the ${label}: ${error instanceof Error ? error.message : 'network error'}.`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const detail = await response
        .text()
        .then((t) => redact(t.trim()).slice(0, ERROR_BODY_LIMIT))
        .catch(() => '');
      throw new Error(
        `${label} request failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
      );
    }

    try {
      return await response.json();
    } catch {
      throw new Error(`${label} returned an invalid JSON response.`);
    }
  }

  return {
    async embed(text: string, { model, dimensions }: OllamaEmbeddingOptions): Promise<number[]> {
      const input = text.trim();
      if (!input) throw new Error('Cannot generate an embedding for empty text.');
      if (!model.trim()) throw new Error('An embedding model is required.');

      const payload = await post(
        '/embeddings',
        { model: model.trim(), input, ...(sendEmbeddingDimensions ? { dimensions } : {}) },
        'embedding API',
      );

      const raw =
        isRecord(payload) && Array.isArray(payload.data) && isRecord(payload.data[0])
          ? payload.data[0].embedding
          : undefined;
      if (!Array.isArray(raw)) throw new Error('Embedding API returned no embedding data.');

      const embedding = raw.map((value) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw new Error('Embedding API returned a non-numeric embedding value.');
        }
        return value;
      });

      if (embedding.length !== dimensions) {
        throw new Error(
          `Embedding API returned ${embedding.length} dimensions; expected ${dimensions}.`,
        );
      }

      return embedding;
    },

    async chat({ model, messages, temperature }: OllamaChatOptions): Promise<string> {
      if (!model?.trim()) throw new Error('A chat model is required.');
      if (!Array.isArray(messages) || messages.length === 0)
        throw new Error('At least one chat message is required.');

      const payload = await post(
        '/chat/completions',
        {
          model: model.trim(),
          messages: messages.map(({ role, content }) => ({ role, content })),
          max_tokens: MAX_ANSWER_TOKENS,
          ...(temperature === undefined ? {} : { temperature }),
        },
        'chat API',
      );

      const content =
        isRecord(payload) &&
        Array.isArray(payload.choices) &&
        isRecord(payload.choices[0]) &&
        isRecord(payload.choices[0].message)
          ? payload.choices[0].message.content
          : undefined;

      if (typeof content !== 'string') throw new Error('Chat API returned no message content.');
      return content;
    },
  };
}
