import type { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

import { config, isTest } from '../config/env.js';

interface UserRateLimitOptions {
  windowMs: number;
  limit: number;
  message: string;
  /** Defaults to skipping in the test environment so other tests stay deterministic. */
  skip?: boolean;
}

/**
 * Per-user rate limit for expensive authenticated routes. Must run after
 * `authenticate`; falls back to the client IP if no user is attached.
 */
export function createUserRateLimiter({
  windowMs,
  limit,
  message,
  skip = isTest,
}: UserRateLimitOptions): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => skip,
    keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? ''),
    handler: (_req, res) => {
      res.status(429).json({ success: false, code: 'RATE_LIMITED', message });
    },
  });
}

// Each chat request occupies the local model for several seconds on CPU.
export const chatRateLimiter = createUserRateLimiter({
  windowMs: 60 * 1000,
  limit: config.chatRateLimitPerMinute,
  message: 'Too many questions. Please wait a minute and try again.',
});

// Uploads embed every chunk, which is the most expensive operation.
export const uploadRateLimiter = createUserRateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: config.uploadRateLimitPerHour,
  message: 'Too many uploads. Please try again later.',
});
