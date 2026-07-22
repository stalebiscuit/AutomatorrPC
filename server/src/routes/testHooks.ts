import { Router, type Response } from 'express';
import { loadConfig } from '../config.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiError } from '../lib/ApiError.js';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../middleware/auth.js';
import { createSession, cookieMaxAges, type IssuedTokens } from '../services/auth/tokenService.js';
import { resolveOnLogin } from '../services/auth/accessService.js';
import { normalizeEmail } from '../services/auth/util.js';

/**
 * E2E-only test seam. Mounted ONLY when E2E_TEST_HOOKS=true AND we are not in
 * production (see `testHooksEnabled`). It exists so Playwright can obtain a real
 * authenticated session without the OTP code — which is never stored, only
 * emailed — by minting a session through the SAME createSession()/cookie path
 * the real login uses. It never weakens production: in production the router is
 * not even constructed, and the guard is belt-and-braces.
 *
 * Anything added here must be safe to expose to a test runner and must refuse
 * to run in production.
 */
export function testHooksEnabled(): boolean {
  return loadConfig().NODE_ENV !== 'production' && process.env.E2E_TEST_HOOKS === 'true';
}

// Mirror the auth route's cookie contract exactly (httpOnly, SameSite=strict,
// Secure only in production so cookies work over http in CI).
function setSessionCookies(res: Response, tokens: IssuedTokens): void {
  const secure = loadConfig().NODE_ENV === 'production';
  const { accessMs, refreshMs } = cookieMaxAges();
  const base = { httpOnly: true as const, sameSite: 'strict' as const, secure, path: '/' };
  res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...base, maxAge: accessMs });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...base, maxAge: refreshMs });
}

export function createTestHooksRouter(): Router {
  const router = Router();

  // Hard refusal if somehow reached in production.
  router.use((_req, _res, next) => {
    if (loadConfig().NODE_ENV === 'production') {
      next(ApiError.forbidden('Test hooks are disabled', 'TEST_HOOKS_DISABLED'));
      return;
    }
    next();
  });

  /** Liveness probe distinct from the app's /health — proves hooks are mounted. */
  router.get('/test/ping', (_req, res) => {
    res.json({ ok: true, hooks: true });
  });

  /**
   * Mint a real session for an already-eligible admin (seeded superadmin or an
   * invited admin). Returns 403 for anyone not eligible — this cannot be used
   * to escalate a non-admin.
   */
  router.post(
    '/test/login',
    asyncHandler(async (req, res) => {
      const email = normalizeEmail(String(req.body?.email ?? ''));
      if (!email) throw ApiError.badRequest('email is required', 'BAD_REQUEST');
      const user = await resolveOnLogin(email);
      if (!user) throw ApiError.forbidden('Not an eligible admin', 'NOT_ELIGIBLE');
      const tokens = await createSession(user, { ip: req.ip ?? '', userAgent: 'e2e' });
      setSessionCookies(res, tokens);
      res.json({ user: { email: user.email, role: user.role } });
    }),
  );

  return router;
}
