
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { saveKnowledgeDocument } from "../src/knowledge/knowledge.repository.js";
import { getResolvedTestDatabaseUrl } from "./test-database-url.js";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient({
    datasources: { db: { url: getResolvedTestDatabaseUrl() } },
});

describe("knowledge repository integration", () => {
    afterAll(async () => {
        await prisma.$disconnect();
    });

    it("saves a document and its vector embedding", async () => {
        const content =
            "This is a knowledge repository integration test with 'quoted text'.";

        const user = await prisma.user.create({
            data: {
                name: "Knowledge Test Admin",
                email: `knowledge-test-${randomUUID()}@example.com`,
                passwordHash: "test-only-hash",
                role: "ADMIN",
            },
        });

        const embedding = Array.from({ length: 768 }, (_, index) =>
            index === 0 ? 1 : 0
        );

        try {
            const document = await saveKnowledgeDocument({
                title: "Integration Test Document",
                mimeType: "text/plain",
                text: content,
                createdById: user.id,
                chunks: [
                    {
                        chunkIndex: 0,
                        content,
                        tokenCount: 8,
                        embedding,
                    },
                ],
            });

            expect(document.status).toBe("READY");

            const chunks = await prisma.documentChunk.findMany({
                where: { documentId: document.id },
            });

            expect(chunks).toHaveLength(1);
            expect(chunks[0]).toBeDefined();
            expect(chunks[0]?.content).toBe(content);
        } finally {
            await prisma.knowledgeDocument.deleteMany({
                where: { title: "Integration Test Document" },
            });
            await prisma.user.delete({ where: { id: user.id } });
        }
    });
});
