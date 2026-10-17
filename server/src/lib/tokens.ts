import { createHash, randomBytes } from 'node:crypto';

/**
 * Generate an opaque, high-entropy refresh token (256 bits of randomness).
 * The raw value is returned to the client once; only its hash is stored.
 */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Hash a refresh token for storage/lookup. SHA-256 is appropriate here because
 * the token is already high-entropy (a slow password hash would add no value
 * and would slow down every refresh).
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
