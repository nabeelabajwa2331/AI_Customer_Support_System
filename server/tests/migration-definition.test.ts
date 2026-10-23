import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(
  new URL(
    '../prisma/migrations/20261023020847_resize_document_chunks_embedding_to_768/migration.sql',
    import.meta.url,
  ),
);

describe('768-dimensional embedding migration', () => {
  it('wraps the safety check and index rebuild in one ordered transaction', async () => {
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('LOCK TABLE public."document_chunks" IN ACCESS EXCLUSIVE MODE;');
    expect(sql).toContain(
      'IF EXISTS (SELECT 1 FROM public."document_chunks" LIMIT 1)',
    );
    expect(sql).toContain('RAISE EXCEPTION');
    expect(sql).toContain('reviewed re-embedding migration');
    expect(sql).toContain(
      'DROP INDEX IF EXISTS public."document_chunks_embedding_hnsw_idx";',
    );
    expect(sql).toMatch(
      /ALTER TABLE public\."document_chunks"\s+ALTER COLUMN "embedding" TYPE vector\(768\);/,
    );
    expect(sql).toContain('CREATE INDEX "document_chunks_embedding_hnsw_idx"');
    expect(sql).toContain('ON public."document_chunks"');
    expect(sql).toContain('USING hnsw ("embedding" vector_cosine_ops);');
    expect(sql).toContain('COMMIT;');

    const begin = sql.indexOf('BEGIN;');
    const lock = sql.indexOf('LOCK TABLE public."document_chunks"');
    const check = sql.indexOf('IF EXISTS (SELECT 1 FROM public."document_chunks"');
    const exception = sql.indexOf('RAISE EXCEPTION');
    const drop = sql.indexOf('DROP INDEX');
    const alter = sql.indexOf('ALTER COLUMN "embedding"');
    const create = sql.indexOf('CREATE INDEX "document_chunks_embedding_hnsw_idx"');
    const commit = sql.indexOf('COMMIT;');

    expect(begin).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(check).toBeGreaterThanOrEqual(0);
    expect(exception).toBeGreaterThanOrEqual(0);
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(alter).toBeGreaterThanOrEqual(0);
    expect(create).toBeGreaterThanOrEqual(0);
    expect(commit).toBeGreaterThanOrEqual(0);

    expect(begin).toBeLessThan(lock);
    expect(lock).toBeLessThan(check);
    expect(check).toBeLessThan(exception);
    expect(exception).toBeLessThan(drop);
    expect(drop).toBeLessThan(alter);
    expect(alter).toBeLessThan(create);
    expect(create).toBeLessThan(commit);

    expect(sql).not.toMatch(/\bCONCURRENTLY\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/DROP\s+COLUMN/i);
    expect(sql).not.toContain('USING NULL');
  });
});
