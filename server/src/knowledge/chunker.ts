
import { encode } from "gpt-tokenizer";
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

  const words = normalizedText.split(/\s+/);
  const chunks: TextChunk[] = [];
  let start = 0;

  while (start < words.length) {
    let end = start;
    let content = "";

    // Build a chunk without exceeding the token budget.
    while (end < words.length) {
      const candidate = [...words.slice(start, end + 1)].join(" ");

      if (encode(candidate).length > chunkSize) break;

      content = candidate;
      end++;
    }

    if (!content) {
      throw new Error(
        "A word exceeds the chunk token limit; handle this text separately.",
      );
    }

    chunks.push({
      content,
      chunkIndex: chunks.length,
      tokenCount: encode(content).length,
    });

    if (end >= words.length) break;

    // Preserve overlap, measured approximately in words.
    start = Math.max(start + 1, end - overlap);
  }

  return chunks;
}
