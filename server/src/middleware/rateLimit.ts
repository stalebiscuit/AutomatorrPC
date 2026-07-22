import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ApiError } from '../lib/ApiError.js';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Minimal fixed-window, in-process rate limiter (sufficient for a single-VM
 * admin surface). Keys by client IP unless a custom key is supplied.
 */
export function rateLimit(opts: {
  windowMs: number;
  max: number;
  key?: (req: Request) => string;
}): RequestHandler {
  const buckets = new Map<string, Bucket>();
  const keyOf = opts.key ?? ((req: Request) => req.ip ?? 'unknown');

  return (req: Request, _res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = keyOf(req);
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      // Opportunistic cleanup so the map can't grow unbounded.
      if (buckets.size > 5000) {
        for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
      }
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > opts.max) {
      next(ApiError.tooManyRequests());
      return;
    }
    next();
  };
}
