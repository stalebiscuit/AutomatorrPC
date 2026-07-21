import { Router, type Response, type RequestHandler } from 'express';
import type { z } from 'zod';
import { loadConfig } from '../../config.js';
import { ApiError } from '../../lib/ApiError.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validate, getValidated } from '../../middleware/validate.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import {
  requireAuth,
  requireCsrf,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  type AuthedRequest,
} from '../../middleware/auth.js';
import { requestOtpBody, verifyOtpBody } from '../schemas.js';
import { issueOtp, verifyOtp } from '../../services/auth/otpService.js';
import { checkEligibility, resolveOnLogin } from '../../services/auth/accessService.js';
import {
  createSession,
  rotateSession,
  revokeByRefreshToken,
  cookieMaxAges,
  type IssuedTokens,
} from '../../services/auth/tokenService.js';
import { audit } from '../../services/auth/auditService.js';
import { normalizeEmail } from '../../services/auth/util.js';

export const adminAuthRouter = Router();

// Per-IP throttle on the credential-free auth endpoints (disabled under test).
const authLimiter: RequestHandler =
  loadConfig().NODE_ENV === 'test'
    ? (_req, _res, next) => next()
    : rateLimit({ windowMs: 60_000, max: 60 });

// Tighter per-IP limits on the two OTP endpoints (launch-polish revision):
// request-otp triggers outbound email (abuse = mail-bombing / cost), and
// verify-otp is the brute-force surface. Both disabled under test.
const requestOtpLimiter: RequestHandler =
  loadConfig().NODE_ENV === 'test'
    ? (_req, _res, next) => next()
    : rateLimit({ windowMs: 15 * 60_000, max: 5 });
const verifyOtpLimiter: RequestHandler =
  loadConfig().NODE_ENV === 'test'
    ? (_req, _res, next) => next()
    : rateLimit({ windowMs: 15 * 60_000, max: 10 });

function setSessionCookies(res: Response, tokens: IssuedTokens): void {
  const secure = loadConfig().NODE_ENV === 'production';
  const { accessMs, refreshMs } = cookieMaxAges();
  const base = { httpOnly: true as const, sameSite: 'strict' as const, secure, path: '/' };
  res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...base, maxAge: accessMs });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...base, maxAge: refreshMs });
}

function clearSessionCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/' });
}

/** Step 1 — request a code. Always responds generically (anti-enumeration). */
adminAuthRouter.post(
  '/admin/auth/request-otp',
  authLimiter,
  requestOtpLimiter,
  validate({ body: requestOtpBody }),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { body } = getValidated<unknown, z.infer<typeof requestOtpBody>>(res);
    const email = normalizeEmail(body.email);
    const ip = req.ip ?? '';
    const eligibility = await checkEligibility(email);
    await audit('auth.otp_requested', {
      actorEmail: email,
      ip,
      userAgent: req.get('user-agent') ?? '',
      metadata: { eligible: eligibility.eligible, reason: eligibility.reason },
    });
    if (eligibility.eligible) await issueOtp(email, ip);
    res.json({ ok: true });
  }),
);

/** Step 2 — verify the code, open a session, set cookies. */
adminAuthRouter.post(
  '/admin/auth/verify-otp',
  authLimiter,
  verifyOtpLimiter,
  validate({ body: verifyOtpBody }),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { body } = getValidated<unknown, z.infer<typeof verifyOtpBody>>(res);
    const email = normalizeEmail(body.email);
    const ip = req.ip ?? '';
    const userAgent = req.get('user-agent') ?? '';

    const eligibility = await checkEligibility(email);
    if (!eligibility.eligible) {
      await audit('auth.otp_failed', { actorEmail: email, ip, metadata: { reason: 'ineligible' } });
      throw ApiError.unauthorized('Invalid or expired code', 'BAD_CODE');
    }

    const result = await verifyOtp(email, body.code);
    if (!result.ok) {
      await audit('auth.otp_failed', { actorEmail: email, ip, metadata: { reason: result.reason } });
      throw ApiError.unauthorized('Invalid or expired code', 'BAD_CODE');
    }

    const user = await resolveOnLogin(email);
    if (!user) throw ApiError.forbidden('Account disabled', 'ACCOUNT_DISABLED');

    const tokens = await createSession(user, { ip, userAgent });
    setSessionCookies(res, tokens);
    await audit('auth.login', {
      actorEmail: user.email,
      actorUserId: user.userId,
      ip,
      userAgent,
      metadata: { sid: tokens.sid },
    });
    res.json({ user: { email: user.email, role: user.role } });
  }),
);

/** Silent rotation. CSRF header required; refresh cookie rotated. */
adminAuthRouter.post(
  '/admin/auth/refresh',
  authLimiter,
  requireCsrf,
  asyncHandler(async (req: AuthedRequest, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token || typeof token !== 'string') throw ApiError.unauthorized('No session', 'NO_SESSION');

    const result = await rotateSession(token, {
      ip: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
    });
    if (!result.ok) {
      clearSessionCookies(res);
      if (result.reason === 'reuse') {
        await audit('auth.refresh_reuse', { ip: req.ip ?? '', userAgent: req.get('user-agent') ?? '' });
      }
      throw ApiError.unauthorized('Session expired', 'SESSION_EXPIRED');
    }
    setSessionCookies(res, result.tokens);
    res.json({ user: { email: result.user.email, role: result.user.role } });
  }),
);

/** End the session (revokes the whole family) and clear cookies. */
adminAuthRouter.post(
  '/admin/auth/logout',
  asyncHandler(async (req: AuthedRequest, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token && typeof token === 'string') {
      const revoked = await revokeByRefreshToken(token, 'logout');
      if (revoked) {
        await audit('auth.logout', {
          actorEmail: revoked.email,
          actorUserId: revoked.userId,
          ip: req.ip ?? '',
        });
      }
    }
    clearSessionCookies(res);
    res.json({ ok: true });
  }),
);

/** Session probe used by the client AuthGate. */
adminAuthRouter.get(
  '/admin/auth/me',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json({ authenticated: true, user: { email: req.admin!.email, role: req.admin!.role } });
  }),
);
