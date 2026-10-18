import { Router, type Request, type Response } from 'express';

import { config } from '../config/env.js';

export const healthRouter = Router();

// Liveness probe: minimal payload, no environment or system details.
healthRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    service: config.serviceName,
    status: 'ok',
  });
});
