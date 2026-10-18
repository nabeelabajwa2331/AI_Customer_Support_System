
import { encode, decode } from "gpt-tokenizer";
import type {
  ChunkingOptions,
  TextChunk,
} from "./knowledge.types.js";

const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_OVERLAP = 50;

export function chunkText(
  text: string,
  options: ChunkingOptions = {
    chunkSize: DEFAULT_CHUNK_SIZE,
    overlap: DEFAULT_OVERLAP,
  },
): TextChunk[] {
  const normalizedText = text.trim();

  if (!normalizedText) return [];

  const { chunkSize, overlap } = options;

  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error("chunkSize must be a positive integer.");
  }

  if (!Number.isInteger(overlap) || overlap < 0) {
    throw new Error("overlap must be a non-negative integer.");
  }

  if (overlap >= chunkSize) {
    throw new Error("overlap must be smaller than chunkSize.");
  }

  const tokens = encode(normalizedText);
  const chunks: TextChunk[] = [];
  const step = chunkSize - overlap;

  for (let start = 0; start < tokens.length; start += step) {
    const chunkTokens = tokens.slice(start, start + chunkSize);
    const content = decode(chunkTokens);

    chunks.push({
      content,
      chunkIndex: chunks.length,
      tokenCount: chunkTokens.length,
    });

    if (start + chunkSize >= tokens.length) break;
  }

  return chunks;
}
