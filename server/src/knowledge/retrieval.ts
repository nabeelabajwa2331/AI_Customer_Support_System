import { AppError, validationFailed } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { generateEmbedding } from './embedding.js';
import { assertEmbeddingDimensions } from './embedding.validation.js';

export const DEFAULT_RETRIEVAL_TOP_K = 5;
export const MAX_RETRIEVAL_TOP_K = 20;
const MIN_RETRIEVAL_TOP_K = 1;

export interface RetrievalOptions {
  topK?: number;
}

export interface RetrievalResult {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number | null;
  distance: number;
  similarity: number;
  document: {
    id: string;
    title: string;
    source: string | null;
    sourceType: string | null;
    mimeType: string | null;
  };
}

interface RetrievalRow {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number | null;
  distance: number;
  title: string;
  source: string | null;
  sourceType: string | null;
  mimeType: string | null;
}

function resolveTopK(topK: number | undefined): number {
  const value = topK ?? DEFAULT_RETRIEVAL_TOP_K;

  if (!Number.isInteger(value) || value < MIN_RETRIEVAL_TOP_K || value > MAX_RETRIEVAL_TOP_K) {
    throw validationFailed([
      {
        path: 'topK',
        message: `topK must be an integer between ${MIN_RETRIEVAL_TOP_K} and ${MAX_RETRIEVAL_TOP_K}.`,
      },
    ]);
  }

  return value;
}

/**
 * Finds the nearest READY document chunks for a natural-language query.
 *
 * The query is embedded with the configured Ollama adapter. Only the resulting
 * vector and the bounded top-k value are sent to PostgreSQL as parameters; the
 * query text is never included in SQL.
 */
export async function retrieveKnowledge(
  query: string,
  options: RetrievalOptions = {},
): Promise<RetrievalResult[]> {
  if (typeof query !== 'string' || query.trim().length === 0) {
    throw validationFailed([{ path: 'query', message: 'Query must not be empty.' }]);
  }

  const normalizedQuery = query.trim();
  const topK = resolveTopK(options.topK);

  let embedding: number[];

  try {
    embedding = await generateEmbedding(normalizedQuery);
  } catch {
    throw new AppError(502, 'EMBEDDING_FAILED', 'Could not generate a query embedding.');
  }

  try {
    assertEmbeddingDimensions(embedding);
  } catch {
    throw new AppError(
      502,
      'INVALID_EMBEDDING',
      'The embedding provider returned an invalid vector.',
    );
  }

  const vector = `[${embedding.join(',')}]`;

  let rows: RetrievalRow[];

  try {
    rows = await prisma.$queryRaw<RetrievalRow[]>`
      SELECT
        c.id AS "chunkId",
        d.id AS "documentId",
        c.chunk_index AS "chunkIndex",
        c.content,
        c.token_count AS "tokenCount",
        d.title,
        d.source,
        d.source_type AS "sourceType",
        d.mime_type AS "mimeType",
        (c.embedding <=> ${vector}::vector) AS distance
      FROM public.document_chunks AS c
      INNER JOIN public.knowledge_documents AS d
        ON d.id = c.document_id
      WHERE d.status = 'READY'
        AND c.embedding IS NOT NULL
      ORDER BY distance ASC, c.id ASC
      LIMIT ${topK}
    `;
  } catch {
    throw new AppError(500, 'RETRIEVAL_FAILED', 'Knowledge retrieval failed.');
  }

  return rows.map((row) => {
    const distance = Number(row.distance);

    return {
      chunkId: row.chunkId,
      documentId: row.documentId,
      chunkIndex: row.chunkIndex,
      content: row.content,
      tokenCount: row.tokenCount,
      distance,
      similarity: 1 - distance,
      document: {
        id: row.documentId,
        title: row.title,
        source: row.source,
        sourceType: row.sourceType,
        mimeType: row.mimeType,
      },
    };
  });
}
