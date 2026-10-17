import { Router, type Request, type Response } from 'express';

import { config } from '../config/env.js';

export const healthRouter = Router();

/**
 * GET /api/health
 *
 * Liveness probe. Returns a minimal payload and never exposes environment
 * variables, credentials, system details, or stack traces.
 */
healthRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    service: config.serviceName,
    status: 'ok',
  });
});
