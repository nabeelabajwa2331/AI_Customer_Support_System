export interface TextChunk {
  content: string;
  chunkIndex: number;
  tokenCount: number;
}

export interface ChunkingOptions {
  chunkSize: number;
  overlap: number;
}
