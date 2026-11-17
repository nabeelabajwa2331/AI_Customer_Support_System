import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';

import { config, isTest } from '../config/env.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateBody } from '../middleware/validate.js';
import {
  changePasswordSchema,
  googleLoginSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  updateProfileSchema,
} from '../schemas/auth.schemas.js';
import * as authService from '../services/auth.service.js';

export const authRouter = Router();

// Throttles auth endpoints; disabled in tests so they stay deterministic.
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

authRouter.post('/register', authRateLimiter, validateBody(registerSchema), async (req, res) => {
  const user = await authService.register(req.body);
  res.status(201).json({ success: true, user });
});

authRouter.post('/login', authRateLimiter, validateBody(loginSchema), async (req, res) => {
  const tokens = await authService.login(req.body);
  res.status(200).json({ success: true, ...tokens });
});

authRouter.post('/refresh', authRateLimiter, validateBody(refreshSchema), async (req, res) => {
  const tokens = await authService.refresh(req.body.refreshToken);
  res.status(200).json({ success: true, ...tokens });
});

authRouter.post('/logout', authRateLimiter, validateBody(refreshSchema), async (req, res) => {
  await authService.logout(req.body.refreshToken);
  res.status(200).json({ success: true, message: 'Logged out' });
});

// Public: the frontend needs the (non-secret) client ID to render Google's button.
authRouter.get('/google/config', (_req, res) => {
  res.status(200).json({
    success: true,
    enabled: config.googleClientId !== null,
    clientId: config.googleClientId,
  });
});

authRouter.post('/google', authRateLimiter, validateBody(googleLoginSchema), async (req, res) => {
  const tokens = await authService.loginWithGoogle(req.body.credential);
  res.status(200).json({ success: true, ...tokens });
});

authRouter.get('/me', authenticate, async (req, res) => {
  const user = await authService.getCurrentUser(req.user!.id);
  res.status(200).json({ success: true, user });
});

// Only the display name is editable; email and role are never changed here.
authRouter.patch('/me', authenticate, validateBody(updateProfileSchema), async (req, res) => {
  const user = await authService.updateProfile(req.user!.id, req.body.name);
  res.status(200).json({ success: true, user });
});

authRouter.post(
  '/change-password',
  authenticate,
  authRateLimiter,
  validateBody(changePasswordSchema),
  async (req, res) => {
    const tokens = await authService.changePassword(
      req.user!.id,
      req.body.currentPassword,
      req.body.newPassword,
    );
    res.status(200).json({ success: true, ...tokens });
  },
);
