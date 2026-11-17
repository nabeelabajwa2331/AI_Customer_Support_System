import express, { type Express } from 'express';
import helmet from 'helmet';

import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiRouter } from './routes/index.js';

// No `listen` here so tests and the entry point can reuse the app.
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
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
