import { createHash, randomBytes } from 'node:crypto';

// 256 bits of randomness; the raw value is returned once, only its hash is stored.
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

// SHA-256 suffices because the token is already high-entropy.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
