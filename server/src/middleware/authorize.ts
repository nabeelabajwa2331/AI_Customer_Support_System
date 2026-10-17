import type { Role } from '@prisma/client';
import type { RequestHandler } from 'express';

import { forbidden, unauthorized } from '../lib/errors.js';

/**
 * Authorization middleware factory.
 *
 * Must run after `authenticate`. Returns 401 when there is no authenticated
 * user and 403 when the user's role is not in the allowed set.
 *
 * Usage (reserved for later milestones, e.g. ticket management):
 *   router.delete('/tickets/:id', authenticate, authorize('ADMIN'), handler)
 */
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
