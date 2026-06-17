import { Router } from 'express';
import type { z } from 'zod';
import { loadConfig } from '../config.js';
import { ApiError } from '../lib/ApiError.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validate, getValidated } from '../middleware/validate.js';
import { requireAdmin } from '../middleware/auth.js';
import { ADMIN_COOKIE, issueToken, verifyCredentials } from '../services/adminAuth.js';
import { getAnalytics } from '../services/analytics.js';
import { adminLoginBody, analyticsQuery } from './schemas.js';

export const adminRouter = Router();

adminRouter.post(
  '/admin/login',
  validate({ body: adminLoginBody }),
  asyncHandler(async (_req, res) => {
    const { body } = getValidated<unknown, z.infer<typeof adminLoginBody>>(res);
    const ok = await verifyCredentials(body.username, body.password);
    if (!ok) throw ApiError.unauthorized('Invalid credentials', 'BAD_CREDENTIALS');

    const token = issueToken(body.username);
    res.cookie(ADMIN_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: loadConfig().NODE_ENV === 'production',
      maxAge: 12 * 60 * 60 * 1000,
      path: '/',
    });
    res.json({ ok: true, username: body.username });
  }),
);

adminRouter.post('/admin/logout', (_req, res) => {
  res.clearCookie(ADMIN_COOKIE, { path: '/' });
  res.json({ ok: true });
});

adminRouter.get(
  '/admin/me',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json({ authenticated: true });
  }),
);

adminRouter.get(
  '/admin/analytics',
  requireAdmin,
  validate({ query: analyticsQuery }),
  asyncHandler(async (_req, res) => {
    const { query } = getValidated<z.infer<typeof analyticsQuery>>(res);
    const analytics = await getAnalytics(query.window);
    res.json(analytics);
  }),
);
