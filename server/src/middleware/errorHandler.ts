import { Prisma } from '@prisma/client';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';
import { AppError, validationFailedFromZod } from '../lib/errors.js';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Not found' });
};

// Maps known errors to safe responses; unexpected ones are logged without stack
// traces or request bodies (so secrets never reach the logs).
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      success: false,
      code: err.code,
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  // express.json() errors. Handled before the generic log below because they
  // carry the raw request body (which can contain passwords).
  if (typeof err === 'object' && err !== null && 'type' in err) {
    if (err.type === 'entity.parse.failed') {
      res
        .status(400)
        .json({ success: false, code: 'INVALID_JSON', message: 'Request body is not valid JSON' });
      return;
    }

    if (err.type === 'entity.too.large') {
      res
        .status(413)
        .json({ success: false, code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' });
      return;
    }
  }

  if (err instanceof ZodError) {
    const validation = validationFailedFromZod(err);
    res.status(validation.status).json({
      success: false,
      code: validation.code,
      message: validation.message,
      details: validation.details,
    });
    return;
  }

  // Prisma unique-constraint violation (e.g. duplicate email) -> 409.
  if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002') {
    res.status(409).json({
      success: false,
      code: 'CONFLICT',
      message: 'A record with these details already exists',
    });
    return;
  }
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'File exceeds the 10 MB upload limit'
        : err.code === 'LIMIT_FILE_COUNT'
          ? 'Only one file can be uploaded at a time'
          : 'File upload failed';

    res.status(400).json({
      success: false,
      code: 'UPLOAD_ERROR',
      message,
    });
    return;
  }

  if (err instanceof Error && err.message === 'Only PDF, DOCX, TXT, and MD files are supported.') {
    res.status(400).json({
      success: false,
      code: 'UNSUPPORTED_FILE_TYPE',
      message: err.message,
    });
    return;
  }
  // Name, message and stack only: logging the whole object could include
  // request data attached by libraries.
  console.error(
    '[server] Unhandled error:',
    err instanceof Error ? (err.stack ?? `${err.name}: ${err.message}`) : 'Non-error value thrown',
  );
  res
    .status(500)
    .json({ success: false, code: 'INTERNAL_ERROR', message: 'Internal server error' });
};
