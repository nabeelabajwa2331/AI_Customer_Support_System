import type { DocumentStatus } from '@prisma/client';

import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

/** Document metadata safe for staff: never includes text, chunks, or embeddings. */
export interface KnowledgeDocumentSummary {
  id: string;
  title: string;
  source: string | null;
  mimeType: string | null;
  status: DocumentStatus;
  chunkCount: number;
  characterCount: number | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; name: string } | null;
}

const summarySelect = {
  id: true,
  title: true,
  source: true,
  mimeType: true,
  status: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
  _count: { select: { chunks: true } },
} as const;

type SummaryRow = {
  id: string;
  title: string;
  source: string | null;
  mimeType: string | null;
  status: DocumentStatus;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; name: string } | null;
  _count: { chunks: number };
};

function characterCountOf(metadata: unknown): number | null {
  if (typeof metadata === 'object' && metadata !== null && 'characterCount' in metadata) {
    const value = (metadata as { characterCount: unknown }).characterCount;
    return typeof value === 'number' ? value : null;
  }

  return null;
}

function toSummary(row: SummaryRow): KnowledgeDocumentSummary {
  return {
    id: row.id,
    title: row.title,
    source: row.source,
    mimeType: row.mimeType,
    status: row.status,
    chunkCount: row._count.chunks,
    characterCount: characterCountOf(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
  };
}

function documentNotFound(): AppError {
  return new AppError(404, 'DOCUMENT_NOT_FOUND', 'Knowledge document not found');
}

export async function listKnowledgeDocuments(): Promise<KnowledgeDocumentSummary[]> {
  const rows = await prisma.knowledgeDocument.findMany({
    select: summarySelect,
    orderBy: { createdAt: 'desc' },
  });

  return rows.map(toSummary);
}

export async function getKnowledgeDocument(id: string): Promise<KnowledgeDocumentSummary> {
  const row = await prisma.knowledgeDocument.findUnique({ where: { id }, select: summarySelect });

  if (!row) throw documentNotFound();

  return toSummary(row);
}

/** Deletes the document; its chunks and embeddings cascade in the database. */
export async function deleteKnowledgeDocument(id: string): Promise<void> {
  const { count } = await prisma.knowledgeDocument.deleteMany({ where: { id } });

  if (count === 0) throw documentNotFound();
}

/** Throws 409 when a document with the same file checksum already exists. */
export async function assertNotDuplicate(checksum: string): Promise<void> {
  const existing = await prisma.knowledgeDocument.findUnique({
    where: { checksum },
    select: { id: true, title: true },
  });

  if (existing) {
    throw new AppError(409, 'DUPLICATE_DOCUMENT', 'This file has already been uploaded.', {
      documentId: existing.id,
      title: existing.title,
    });
  }
}
