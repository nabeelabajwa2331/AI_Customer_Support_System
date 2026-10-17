import bcrypt from 'bcryptjs';

import { config } from '../config/env.js';

/**
 * Hash a plaintext password with bcrypt.
 *
 * bcrypt embeds a random salt in the output and is intentionally slow, which
 * makes offline brute-force attacks costly. We use a cost factor from config
 * (default 12).
 */
export function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, config.bcryptRounds);
}

/** Constant-time comparison of a plaintext password against a stored hash. */
export function verifyPassword(plaintext: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, passwordHash);
}
