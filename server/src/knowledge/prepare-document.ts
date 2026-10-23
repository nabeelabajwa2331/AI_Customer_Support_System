import { extractDocumentText } from './document-extractor.js';
import { chunkText } from './chunker.js';

export interface PreparedDocument {
  fileName: string;
  mimeType: string;
  text: string;
  chunks: ReturnType<typeof chunkText>;
}

export async function prepareDocument(
  filePath: string,
  originalFileName?: string,
): Promise<PreparedDocument> {
  const extracted = await extractDocumentText(filePath, originalFileName);

  const chunks = chunkText(extracted.text);

  if (chunks.length === 0) {
    throw new Error('The document contains no chunkable text.');
  }

  return {
    fileName: extracted.fileName,
    mimeType: extracted.mimeType,
    text: extracted.text,
    chunks,
  };
}
