import { Router } from 'express';

import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

export const adminRouter = Router();

/**
 * Placeholder admin-only endpoint.
 *
 * Its only purpose is to exercise (and make testable) the role-based
 * authorization layer. Real administrative features are added in later
 * milestones.
 */
adminRouter.get('/ping', authenticate, authorize('ADMIN'), (_req, res) => {
  res.status(200).json({ success: true, message: 'pong (admin)' });
});
