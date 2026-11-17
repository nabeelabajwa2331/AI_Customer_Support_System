import { Router, type Request } from 'express';
import multer from 'multer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import {
  assertNotDuplicate,
  deleteKnowledgeDocument,
  getKnowledgeDocument,
  listKnowledgeDocuments,
} from '../knowledge/documents.service.js';
import { ingestDocument } from '../knowledge/ingestion.js';
import { saveKnowledgeDocument } from '../knowledge/knowledge.repository.js';
import { retrieveKnowledge } from '../knowledge/retrieval.js';
import { validationFailedFromZod } from '../lib/errors.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { uploadRateLimiter } from '../middleware/rateLimits.js';
import { validateBody } from '../middleware/validate.js';
import {
  documentIdParamsSchema,
  searchKnowledgeSchema,
  type SearchKnowledgeInput,
} from '../schemas/knowledge.schemas.js';

export const knowledgeRouter = Router();

function parseDocumentId(req: Request): string {
  const parsed = documentIdParamsSchema.safeParse(req.params);
  if (!parsed.success) throw validationFailedFromZod(parsed.error);
  return parsed.data.id;
}

knowledgeRouter.get(
  '/documents',
  authenticate,
  authorize('ADMIN', 'SUPPORT_AGENT'),
  async (_req, res) => {
    res.status(200).json({ success: true, documents: await listKnowledgeDocuments() });
  },
);

knowledgeRouter.get(
  '/documents/:id',
  authenticate,
  authorize('ADMIN', 'SUPPORT_AGENT'),
  async (req, res) => {
    res
      .status(200)
      .json({ success: true, document: await getKnowledgeDocument(parseDocumentId(req)) });
  },
);

knowledgeRouter.delete('/documents/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  await deleteKnowledgeDocument(parseDocumentId(req));
  res.status(200).json({ success: true, message: 'Document deleted' });
});

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

// Staff only: search returns raw document text. Customers get answers through
// /api/chat, which returns source metadata but never chunk content.
knowledgeRouter.post(
  '/search',
  authenticate,
  authorize('ADMIN', 'SUPPORT_AGENT'),
  validateBody(searchKnowledgeSchema),
  async (req, res) => {
    const { query, topK } = req.body as SearchKnowledgeInput;
    const results = await retrieveKnowledge(query, topK === undefined ? {} : { topK });

    res.status(200).json({ success: true, results });
  },
);

knowledgeRouter.post(
  '/upload',
  authenticate,
  authorize('ADMIN'),
  uploadRateLimiter,
  async (req, res, next) => {
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
        // Checked before ingestion so a duplicate never costs embedding time.
        const checksum = createHash('sha256')
          .update(await readFile(req.file.path))
          .digest('hex');
        await assertNotDuplicate(checksum);

        // Multer's temp path has no extension, so pass the original filename
        // through to the extractor (and keep it as the document title/source).
        const ingested = await ingestDocument(req.file.path, req.file.originalname);

        const document = await saveKnowledgeDocument({
          title: ingested.fileName,
          source: req.file.originalname,
          mimeType: ingested.mimeType,
          text: ingested.text,
          checksum,
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
  },
);
