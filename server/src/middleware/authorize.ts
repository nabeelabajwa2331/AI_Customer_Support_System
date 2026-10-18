import type { Role } from '@prisma/client';
import type { RequestHandler } from 'express';

import { forbidden, unauthorized } from '../lib/errors.js';

// Must run after `authenticate`: 401 without a user, 403 when the role is not allowed.
export function authorize(...allowedRoles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(unauthorized('Authentication required'));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(forbidden());
      return;
    }

    next();
  };
}
