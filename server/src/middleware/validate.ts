import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

import { validationFailedFromZod } from '../lib/errors.js';

// Validates `req.body`; Zod strips unknown keys so clients cannot inject `role`
// or `passwordHash`. The parsed value replaces `req.body`.
export function validateBody(schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      next(validationFailedFromZod(result.error));
      return;
    }

    req.body = result.data;
    next();
  };
}
