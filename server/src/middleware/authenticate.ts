import type { RequestHandler } from 'express';

import { verifyAccessToken } from '../lib/jwt.js';
import { unauthorized } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

/**
 * Authentication middleware.
 *
 * Expects `Authorization: Bearer <jwt>`. The token signature/expiry is
 * verified, then the user is loaded from the database so that role changes or
 * deletions take effect immediately (rather than being trusted from the token).
 *
 * Express 5 forwards rejected promises to the error handler automatically, so
 * throwing here is safe.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    throw unauthorized('Authentication required');
  }

  const token = header.slice('Bearer '.length).trim();

  let claims;
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
