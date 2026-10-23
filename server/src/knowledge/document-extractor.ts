
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export interface ExtractedDocument {
  text: string;
  mimeType: string;
  fileName: string;
}

export async function extractDocumentText(
  filePath: string,
  originalFileName?: string,
): Promise<ExtractedDocument> {
  // Multer's temporary filename has no extension, so prefer
  // the original uploaded filename when determining file type.
  const fileName = originalFileName
    ? path.basename(originalFileName)
    : path.basename(filePath);

  const extension = path.extname(fileName).toLowerCase();

  let text: string;
  let mimeType: string;

  if (extension === ".pdf") {
    const buffer = await readFile(filePath);
    const parser = new PDFParse({ data: buffer });

    try {
      const result = await parser.getText();
      text = result.text;
    } finally {
      await parser.destroy();
    }

    mimeType = "application/pdf";
  } else if (extension === ".docx") {
    const buffer = await readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
    mimeType =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  } else if (extension === ".txt" || extension === ".md") {
    text = await readFile(filePath, "utf8");
    mimeType = extension === ".md" ? "text/markdown" : "text/plain";
  } else {
    throw new Error(
      "Unsupported file type. Upload a PDF, DOCX, TXT, or MD file.",
    );
  }

  text = text.trim();

  if (!text) {
    throw new Error("No readable text was found in the document.");
  }

  return { text, mimeType, fileName };
}
