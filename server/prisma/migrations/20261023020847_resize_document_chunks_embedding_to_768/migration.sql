-- Existing chunks require a reviewed re-embedding migration; never discard
-- vectors here. Prisma does not guarantee an implicit transaction for
-- migration scripts, so keep the lock, safety check, and all DDL atomic.
BEGIN;

LOCK TABLE public."document_chunks" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public."document_chunks" LIMIT 1) THEN
        RAISE EXCEPTION 'Cannot resize public.document_chunks.embedding to vector(768): existing document_chunks rows require a reviewed re-embedding migration.';
    END IF;
END
$$;

DROP INDEX IF EXISTS public."document_chunks_embedding_hnsw_idx";

ALTER TABLE public."document_chunks"
    ALTER COLUMN "embedding" TYPE vector(768);

CREATE INDEX "document_chunks_embedding_hnsw_idx"
    ON public."document_chunks"
    USING hnsw ("embedding" vector_cosine_ops);

COMMIT;
