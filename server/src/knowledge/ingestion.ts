import { generateEmbedding } from './embedding.js';
import { prepareDocument } from './prepare-document.js';

export interface IngestedChunk {
  chunkIndex: number;
  content: string;
  tokenCount: number;
  embedding: number[];
}

export interface IngestedDocument {
  fileName: string;
  mimeType: string;
  text: string;
  chunks: IngestedChunk[];
}

export async function ingestDocument(
  filePath: string,
  originalFileName?: string,
): Promise<IngestedDocument> {
  // Multer stores uploads under a generated temp name with no extension, so the
  // original client filename must be forwarded to pick the right extractor.
  const prepared = await prepareDocument(filePath, originalFileName);

  const chunks: IngestedChunk[] = [];

  for (const chunk of prepared.chunks) {
    chunks.push({
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      embedding: await generateEmbedding(chunk.content),
    });
  }

  return {
    fileName: prepared.fileName,
    mimeType: prepared.mimeType,
    text: prepared.text,
    chunks,
  };
}
