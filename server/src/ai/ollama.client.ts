const DEFAULT_TIMEOUT_MS = 30_000;
const ERROR_BODY_LIMIT = 500;

export interface OllamaClientOptions {
  baseUrl: string;
  timeoutMs?: number;
}

export interface OllamaEmbeddingOptions {
  model: string;
  dimensions: number;
}

export interface OllamaClient {
  embed(text: string, options: OllamaEmbeddingOptions): Promise<number[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '');

  if (!normalized) {
    throw new Error('Ollama base URL must not be empty.');
  }

  return normalized;
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const body = (await response.text()).trim();

    if (!body) {
      return '';
    }

    return `: ${body.slice(0, ERROR_BODY_LIMIT)}`;
  } catch {
    return '';
  }
}

export function createOllamaClient({
  baseUrl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: OllamaClientOptions): OllamaClient {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Ollama timeout must be a positive integer.');
  }

  return {
    async embed(text, { model, dimensions }) {
      const normalizedText = text.trim();
      const normalizedModel = model.trim();

      if (!normalizedText) {
        throw new Error('Cannot generate an embedding for empty text.');
      }

      if (!normalizedModel) {
        throw new Error('An Ollama embedding model is required.');
      }

      if (!Number.isInteger(dimensions) || dimensions <= 0) {
        throw new Error('Expected embedding dimensions must be a positive integer.');
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;

      try {
        response = await fetch(`${normalizedBaseUrl}/api/embed`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            model: normalizedModel,
            input: normalizedText,
          }),
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error(
            `Ollama did not respond within ${timeoutMs}ms at ${normalizedBaseUrl}. Is the server running?`,
          );
        }

        const detail = error instanceof Error ? error.message : 'Unknown network error';
        throw new Error(
          `Could not reach Ollama at ${normalizedBaseUrl}: ${detail}. Is the server running?`,
        );
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const body = await readErrorBody(response);
        const status = `HTTP ${response.status}${
          response.statusText ? ` ${response.statusText}` : ''
        }`;

        throw new Error(`Ollama embedding request failed with ${status}${body}`);
      }

      let payload: unknown;

      try {
        payload = await response.json();
      } catch {
        throw new Error('Ollama returned an invalid JSON response.');
      }

      if (!isRecord(payload) || !Array.isArray(payload.embeddings)) {
        throw new Error('Ollama returned no embedding data.');
      }

      const rawEmbedding = payload.embeddings[0];

      if (!Array.isArray(rawEmbedding)) {
        throw new Error('Ollama returned no embedding data.');
      }

      const embedding: number[] = [];

      for (const value of rawEmbedding) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw new Error('Ollama returned a non-numeric embedding value.');
        }

        embedding.push(value);
      }

      if (embedding.length !== dimensions) {
        throw new Error(
          `Ollama returned an embedding with ${embedding.length} dimensions; expected ${dimensions}.`,
        );
      }

      return embedding;
    },
  };
}
