import { Prisma } from '@prisma/client';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

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
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    res.status(409).json({
      success: false,
      code: 'CONFLICT',
      message: 'A record with these details already exists',
    });
    return;
  }

  console.error('[server] Unhandled error:', err);
  res
    .status(500)
    .json({ success: false, code: 'INTERNAL_ERROR', message: 'Internal server error' });
};
