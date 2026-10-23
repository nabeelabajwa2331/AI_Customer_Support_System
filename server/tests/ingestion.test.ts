import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Mock the embedding module so these tests never call a local Ollama server.
vi.mock('../src/knowledge/embedding.js', () => ({
  generateEmbedding: vi.fn(async () => new Array<number>(768).fill(0)),
}));

import { ingestDocument } from '../src/knowledge/ingestion.js';

describe('ingestDocument', () => {
  it('reads a Multer temp path using the original filename extension', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'knowledge-test-'));
    // No extension, just like a file saved by Multer's disk storage.
    const filePath = path.join(directory, 'a1b2c3d4e5');

    try {
      await writeFile(filePath, 'Reset your password from the account settings page.');

      const result = await ingestDocument(filePath, 'password-reset.txt');

      expect(result.fileName).toBe('password-reset.txt');
      expect(result.mimeType).toBe('text/plain');
      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0]?.embedding).toHaveLength(768);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects a file whose original filename has an unsupported extension', async () => {
    await expect(ingestDocument('temp-no-extension', 'malware.exe')).rejects.toThrow(
      'Unsupported file type',
    );
  });
});
