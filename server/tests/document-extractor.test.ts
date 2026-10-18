
import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { extractDocumentText } from "../src/knowledge/document-extractor.js";

describe("extractDocumentText", () => {
  it("extracts plain text from a TXT file", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "knowledge-test-"),
    );
    const filePath = path.join(directory, "sample.txt");

    try {
      await writeFile(filePath, "Customer support knowledge base.");
      const result = await extractDocumentText(filePath);

      expect(result.text).toBe("Customer support knowledge base.");
      expect(result.mimeType).toBe("text/plain");
      expect(result.fileName).toBe("sample.txt");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects unsupported file types", async () => {
    await expect(
      extractDocumentText("sample.exe"),
    ).rejects.toThrow("Unsupported file type");
  });

  it("rejects empty text files", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "knowledge-test-"),
    );
    const filePath = path.join(directory, "empty.txt");

    try {
      await writeFile(filePath, "   ");

      await expect(
        extractDocumentText(filePath),
      ).rejects.toThrow("No readable text");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
