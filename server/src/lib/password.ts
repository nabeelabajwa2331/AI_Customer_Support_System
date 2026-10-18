import bcrypt from 'bcryptjs';

import { config } from '../config/env.js';

// bcrypt embeds a random salt and is intentionally slow (cost from config).
export function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, config.bcryptRounds);
}

/** Constant-time comparison of a plaintext password against a stored hash. */
export function verifyPassword(plaintext: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, passwordHash);
}
