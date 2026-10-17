import type { Role } from '@prisma/client';
import { SignJWT, jwtVerify } from 'jose';

import { config } from '../config/env.js';

export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: Role;
}

const algorithm = 'HS256';
const secret = new TextEncoder().encode(config.authSecret);

/** Sign a short-lived JWT access token. */
export function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ email: claims.email, role: claims.role })
    .setProtectedHeader({ alg: algorithm })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(config.jwtExpiresIn)
    .sign(secret);
}

/**
 * Verify an access token's signature and expiry.
 * Throws if the token is invalid, tampered with, or expired.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  // Pin the accepted algorithm to prevent algorithm-confusion attacks.
  const { payload } = await jwtVerify(token, secret, { algorithms: [algorithm] });

  if (typeof payload.sub !== 'string' || typeof payload.email !== 'string' || typeof payload.role !== 'string') {
    throw new Error('Malformed token payload');
  }

  return { sub: payload.sub, email: payload.email, role: payload.role as Role };
}
