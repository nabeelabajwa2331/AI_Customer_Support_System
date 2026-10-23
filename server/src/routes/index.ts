import { Router } from 'express';
import { knowledgeRouter } from './knowledge.routes.js';

import { adminRouter } from './admin.routes.js';
import { authRouter } from './auth.routes.js';
import { healthRouter } from './health.routes.js';

export const apiRouter = Router();

apiRouter.use(healthRouter); // GET /api/health
apiRouter.use('/auth', authRouter); // /api/auth/*
apiRouter.use('/admin', adminRouter); // /api/admin/*
apiRouter.use('/knowledge', knowledgeRouter); // /api/knowledge/*
