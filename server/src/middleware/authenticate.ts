import type { RequestHandler } from 'express';

import type { AccessTokenClaims } from '../lib/jwt.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { unauthorized } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

// Verifies `Authorization: Bearer <jwt>` and loads the user from the database so
// role changes and deletions take effect immediately. Express 5 forwards thrown
// errors to the error handler.
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    throw unauthorized('Authentication required');
  }

  const token = header.slice('Bearer '.length).trim();

  let claims: AccessTokenClaims;
  try {
    claims = await verifyAccessToken(token);
  } catch {
    // Never leak why verification failed (expired vs. tampered).
    throw unauthorized('Invalid or expired token');
  }

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user) {
    throw unauthorized('Invalid or expired token');
  }

  req.user = { id: user.id, email: user.email, role: user.role };
  next();
};
