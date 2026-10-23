import { Prisma, PrismaClient } from "@prisma/client";

import { assertEmbeddingDimensions } from "./embedding.validation.js";

const prisma = new PrismaClient();

export async function saveKnowledgeDocument(input: {
  title: string;
  source?: string;
  mimeType: string;
  text: string;
  chunks: Array<{
    chunkIndex: number;
    content: string;
    tokenCount: number;
    embedding: number[];
  }>;
  createdById?: string;
}) {
  for (const chunk of input.chunks) {
    assertEmbeddingDimensions(chunk.embedding);
  }

 return prisma.$transaction(
  async (tx: Prisma.TransactionClient) => {
    const document = await tx.knowledgeDocument.create({
      data: {
        title: input.title,
        source: input.source,
        mimeType: input.mimeType,
        status: "PROCESSING",
        createdById: input.createdById,
        metadata: {
          characterCount: input.text.length,
          chunkCount: input.chunks.length,
        },
      },
    });

    for (const chunk of input.chunks) {
      const vector = `[${chunk.embedding.join(",")}]`;

      await tx.$executeRaw`
        INSERT INTO document_chunks
          (id, document_id, chunk_index, content, token_count, embedding, created_at)
        VALUES
          (
            ${crypto.randomUUID()}::uuid,
            ${document.id}::uuid,
            ${chunk.chunkIndex},
            ${chunk.content},
            ${chunk.tokenCount},
            ${vector}::vector,
            NOW()
          )
      `;
    }

    return tx.knowledgeDocument.update({
      where: { id: document.id },
      data: { status: "READY" },
    });
  });
}
