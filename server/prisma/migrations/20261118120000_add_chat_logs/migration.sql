-- Additive only: a new table for assistant question logs used by staff analytics.
-- No existing table or row is changed.

-- CreateEnum
CREATE TYPE "ChatOutcome" AS ENUM ('ANSWERED', 'NOT_SPECIFIED', 'NO_EVIDENCE', 'ACTION_UNAVAILABLE', 'FAILED');

-- CreateTable
CREATE TABLE "chat_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "outcome" "ChatOutcome" NOT NULL,
    "source_count" INTEGER NOT NULL DEFAULT 0,
    "top_similarity" DOUBLE PRECISION,
    "document_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "latency_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_logs_created_at_idx" ON "chat_logs"("created_at");

-- CreateIndex
CREATE INDEX "chat_logs_outcome_created_at_idx" ON "chat_logs"("outcome", "created_at");

-- CreateIndex
CREATE INDEX "chat_logs_user_id_idx" ON "chat_logs"("user_id");

-- AddForeignKey
ALTER TABLE "chat_logs" ADD CONSTRAINT "chat_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
