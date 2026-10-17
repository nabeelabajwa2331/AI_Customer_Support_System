import { Prisma } from '@prisma/client';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

import { AppError } from '../lib/errors.js';

/** Terminal handler for unmatched routes. */
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
};

/**
 * Central error handler.
 *
 * Translates known error types into safe HTTP responses. Internal errors are
 * logged but never returned with stack traces. We intentionally do not log
 * request bodies, so passwords/tokens are not written to logs.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      success: false,
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      details: err.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    });
    return;
  }

  // Prisma unique-constraint violation (e.g. duplicate email) -> 409.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    res.status(409).json({ success: false, message: 'A record with these details already exists' });
    return;
  }

  console.error('[server] Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
};
