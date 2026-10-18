import type { Role } from '@prisma/client';

// Authenticated user attached by the `authenticate` middleware.
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; role: Role };
    }
  }
}

export {};
