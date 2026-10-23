import { Router } from 'express';
import multer from 'multer';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { ingestDocument } from '../knowledge/ingestion.js';
import { saveKnowledgeDocument } from '../knowledge/knowledge.repository.js';

export const knowledgeRouter = Router();

const uploadDirectory = path.resolve(process.cwd(), 'uploads', 'knowledge');

const allowedExtensions = new Set(['.pdf', '.docx', '.txt', '.md']);

const upload = multer({
  dest: uploadDirectory,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (!allowedExtensions.has(extension)) {
      callback(new Error('Only PDF, DOCX, TXT, and MD files are supported.'));
      return;
    }

    callback(null, true);
  },
});

knowledgeRouter.post('/upload', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    await mkdir(uploadDirectory, { recursive: true });
  } catch (error) {
    next(error);
    return;
  }

  upload.single('file')(req, res, async (uploadError) => {
    if (uploadError) {
      next(uploadError);
      return;
    }

    if (!req.file) {
      res.status(400).json({
        success: false,
        message: 'Select a file using the "file" field.',
      });
      return;
    }

    try {
      // Multer's temp path has no extension, so pass the original filename
      // through to the extractor (and keep it as the document title/source).
      const ingested = await ingestDocument(req.file.path, req.file.originalname);

      const document = await saveKnowledgeDocument({
        title: ingested.fileName,
        source: req.file.originalname,
        mimeType: ingested.mimeType,
        text: ingested.text,
        createdById: req.user!.id,
        chunks: ingested.chunks,
      });

      res.status(201).json({
        success: true,
        document: {
          id: document.id,
          title: document.title,
          status: document.status,
          chunkCount: ingested.chunks.length,
        },
      });
    } catch (error) {
      next(error);
    } finally {
      await rm(req.file.path, { force: true }).catch(() => undefined);
    }
  });
});
