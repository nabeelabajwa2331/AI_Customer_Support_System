import { Router, type Request } from 'express';
import type { ZodType, z } from 'zod';

import { validationFailedFromZod } from '../lib/errors.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import {
  analyticsQuerySchema,
  listUsersQuerySchema,
  updateUserRoleSchema,
  userIdParamsSchema,
  type UpdateUserRoleInput,
} from '../schemas/admin.schemas.js';
import { getChatAnalytics } from '../services/analytics.service.js';
import { deleteUser, listUsers, updateUserRole } from '../services/users.service.js';

export const adminRouter = Router();

function parse<S extends ZodType>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw validationFailedFromZod(parsed.error);
  return parsed.data;
}

const userId = (req: Request) => parse(userIdParamsSchema, req.params).id;

// Placeholder endpoint that exercises the role-based authorization layer.
adminRouter.get('/ping', authenticate, authorize('ADMIN'), (_req, res) => {
  res.status(200).json({ success: true, message: 'pong (admin)' });
});

// ---- User management (administrators only) ----

adminRouter.get('/users', authenticate, authorize('ADMIN'), async (req, res) => {
  res.status(200).json({ success: true, ...(await listUsers(parse(listUsersQuerySchema, req.query))) });
});

adminRouter.patch(
  '/users/:id',
  authenticate,
  authorize('ADMIN'),
  validateBody(updateUserRoleSchema),
  async (req, res) => {
    const { role } = req.body as UpdateUserRoleInput;
    const user = await updateUserRole(req.user!.id, userId(req), role);
    res.status(200).json({ success: true, user });
  },
);

adminRouter.delete('/users/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  await deleteUser(req.user!.id, userId(req));
  res.status(200).json({ success: true, message: 'User deleted' });
});

// ---- Analytics (all staff; user totals only for administrators) ----

adminRouter.get(
  '/analytics',
  authenticate,
  authorize('ADMIN', 'SUPPORT_AGENT'),
  async (req, res) => {
    const { days } = parse(analyticsQuerySchema, req.query);
    const analytics = await getChatAnalytics(days, { includeUsers: req.user!.role === 'ADMIN' });
    res.status(200).json({ success: true, analytics });
  },
);
