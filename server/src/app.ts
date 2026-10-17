import express, { type Express } from 'express';

import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiRouter } from './routes/index.js';

/**
 * Build and configure the Express application.
 *
 * Kept free of side effects (no `listen`) so it can be reused by tests and by
 * the server entry point.
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  // Cap the request body size to limit abuse.
  app.use(express.json({ limit: '100kb' }));

  // Feature routers are mounted under /api.
  app.use('/api', apiRouter);

  // Terminal handlers (order matters: 404 first, then the error handler).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
