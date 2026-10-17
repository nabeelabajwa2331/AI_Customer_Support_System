import { Router } from 'express';

import { adminRouter } from './admin.routes.js';
import { authRouter } from './auth.routes.js';
import { healthRouter } from './health.routes.js';

/** Root API router (mounted at `/api`). */
export const apiRouter = Router();

apiRouter.use(healthRouter); // GET /api/health
apiRouter.use('/auth', authRouter); // /api/auth/*
apiRouter.use('/admin', adminRouter); // /api/admin/*
