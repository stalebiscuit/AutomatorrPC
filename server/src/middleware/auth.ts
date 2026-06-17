import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../lib/ApiError.js';
import { ADMIN_COOKIE, verifyToken, type AdminTokenPayload } from '../services/adminAuth.js';

export interface AuthedRequest extends Request {
  admin?: AdminTokenPayload;
}

/** Guard for /api/admin/* — requires a valid admin JWT in the httpOnly cookie. */
export function requireAdmin(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[ADMIN_COOKIE];
  if (!token || typeof token !== 'string') {
    next(ApiError.unauthorized('Admin authentication required'));
    return;
  }
  try {
    req.admin = verifyToken(token);
    next();
  } catch {
    next(ApiError.unauthorized('Invalid or expired session', 'INVALID_SESSION'));
  }
}
