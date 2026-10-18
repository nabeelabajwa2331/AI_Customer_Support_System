
import { prepareDocument } from "./prepare-document.js";
import { generateEmbedding } from "./embedding.js";

export async function ingestDocument(filePath: string) {
  const prepared = await prepareDocument(filePath);

  const chunksWithEmbeddings = [];

  for (const chunk of prepared.chunks) {
    const embedding = await generateEmbedding(chunk.content);

    chunksWithEmbeddings.push({
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      embedding,
    });
  }

  return {
    fileName: prepared.fileName,
    mimeType: prepared.mimeType,
    text: prepared.text,
    chunks: chunksWithEmbeddings,
  };
}
