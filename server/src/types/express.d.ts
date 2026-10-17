import type { Role } from '@prisma/client';

/**
 * Augment Express's Request type with the authenticated user attached by the
 * `authenticate` middleware.
 */
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; role: Role };
    }
  }
}

export {};
