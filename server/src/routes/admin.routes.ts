import { Router } from 'express';

import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

export const adminRouter = Router();

// Placeholder endpoint that exercises the role-based authorization layer.
adminRouter.get('/ping', authenticate, authorize('ADMIN'), (_req, res) => {
  res.status(200).json({ success: true, message: 'pong (admin)' });
});
