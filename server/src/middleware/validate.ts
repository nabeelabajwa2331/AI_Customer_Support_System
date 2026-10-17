import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

import { AppError } from '../lib/errors.js';

/**
 * Validate `req.body` against a Zod schema.
 *
 * Unknown keys are stripped by default, so a client cannot inject fields such
 * as `role` or `passwordHash`. On success the parsed (and normalized) value
 * replaces `req.body`.
 */
export function validateBody(schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      }));
      next(new AppError(400, 'VALIDATION_ERROR', 'Validation failed', details));
      return;
    }

    req.body = result.data;
    next();
  };
}
