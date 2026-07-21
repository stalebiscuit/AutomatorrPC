import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../lib/ApiError.js';
import { verifyAccessToken, type AccessClaims } from '../services/auth/tokenService.js';

/** httpOnly cookie names for the admin session (spec §5). */
export const ACCESS_COOKIE = 'sp_at';
export const REFRESH_COOKIE = 'sp_rt';

export interface AuthedRequest extends Request {
  admin?: AccessClaims;
}

/** Require a valid RS256 access token (httpOnly cookie). Attaches `req.admin`. */
export function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[ACCESS_COOKIE];
  if (!token || typeof token !== 'string') {
    next(ApiError.unauthorized('Admin authentication required'));
    return;
  }
  try {
    req.admin = verifyAccessToken(token);
    next();
  } catch {
    next(ApiError.unauthorized('Invalid or expired session', 'INVALID_SESSION'));
  }
}

/** Require the super-admin role. Must run after `requireAuth`. */
export function requireSuperadmin(req: AuthedRequest, _res: Response, next: NextFunction): void {
  if (req.admin?.role !== 'superadmin') {
    next(ApiError.forbidden('Super-admin privileges required'));
    return;
  }
  next();
}

/**
 * CSRF defense for state-changing admin requests: require a custom header that
 * cross-site navigations/forms cannot set (paired with SameSite=strict cookies).
 */
export function requireCsrf(req: Request, _res: Response, next: NextFunction): void {
  if (!req.get('x-csrf')) {
    next(ApiError.forbidden('Missing CSRF header', 'CSRF_REQUIRED'));
    return;
  }
  next();
}
