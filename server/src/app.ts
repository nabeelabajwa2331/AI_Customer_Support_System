import express, { type Express } from 'express';
import helmet from 'helmet';

import { config } from './config/env.js';
import { cors } from './middleware/cors.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiRouter } from './routes/index.js';

// No `listen` here so tests and the entry point can reuse the app.
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  // Behind Render's proxy, use X-Forwarded-For so rate limits see real IPs.
  if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy);
  // Before everything else so preflight requests are answered directly.
  app.use(cors(config.corsOrigins));
  // Standard security headers (nosniff, frame denial, HSTS, CSP for any HTML).
  app.use(helmet());
  // Cap the request body size to limit abuse.
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', apiRouter);

  // Order matters: 404 first, then the error handler.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
