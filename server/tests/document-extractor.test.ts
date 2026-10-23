import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { extractDocumentText } from '../src/knowledge/document-extractor.js';

async function withTempFile(
  tempName: string,
  content: string,
  run: (filePath: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'knowledge-test-'));
  const filePath = path.join(directory, tempName);

  try {
    await writeFile(filePath, content);
    await run(filePath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe('extractDocumentText', () => {
  it('extracts plain text from a TXT file', async () => {
    await withTempFile('sample.txt', 'Customer support knowledge base.', async (filePath) => {
      const result = await extractDocumentText(filePath);

      expect(result.text).toBe('Customer support knowledge base.');
      expect(result.mimeType).toBe('text/plain');
      expect(result.fileName).toBe('sample.txt');
    });
  });

  it('uses the original filename when the stored path has no extension', async () => {
    // Multer saves uploads under a generated name with no extension.
    await withTempFile('3f9c1a5b2e7d', 'Knowledge base content.', async (filePath) => {
      const result = await extractDocumentText(filePath, 'guide.txt');

      expect(result.text).toBe('Knowledge base content.');
      expect(result.mimeType).toBe('text/plain');
      expect(result.fileName).toBe('guide.txt');
    });
  });

  it('detects markdown from the original filename when the path has no extension', async () => {
    await withTempFile('a1b2c3d4e5', '# Heading', async (filePath) => {
      const result = await extractDocumentText(filePath, 'notes.md');

      expect(result.mimeType).toBe('text/markdown');
      expect(result.fileName).toBe('notes.md');
    });
  });

  it('reduces the original filename to its base name', async () => {
    await withTempFile('temp-no-extension', 'Notes body', async (filePath) => {
      const result = await extractDocumentText(filePath, 'uploads/notes.md');

      expect(result.fileName).toBe('notes.md');
    });
  });

  it('rejects unsupported file types from the original filename', async () => {
    await expect(extractDocumentText('temp-no-extension', 'sample.exe')).rejects.toThrow(
      'Unsupported file type',
    );
  });

  it('rejects empty text files', async () => {
    await withTempFile('empty.txt', '   ', async (filePath) => {
      await expect(extractDocumentText(filePath)).rejects.toThrow('No readable text');
    });
  });

  it('rejects an empty document identified by its original filename', async () => {
    await withTempFile('temp-no-extension', '   ', async (filePath) => {
      await expect(extractDocumentText(filePath, 'empty.txt')).rejects.toThrow('No readable text');
    });
  });
});
