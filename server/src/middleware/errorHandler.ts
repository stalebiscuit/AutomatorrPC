import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../lib/ApiError.js';
import { logger } from '../lib/logger.js';
import type { ApiError as ApiErrorBody } from '@automatorr/shared';

export function notFoundHandler(_req: Request, res: Response): void {
  const body: ApiErrorBody = { error: 'Route not found', code: 'ROUTE_NOT_FOUND' };
  res.status(404).json(body);
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    const body: ApiErrorBody = { error: err.message, code: err.code };
    res.status(err.status).json(body);
    return;
  }
  if (err instanceof ZodError) {
    const body: ApiErrorBody = {
      error: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      code: 'VALIDATION_ERROR',
    };
    res.status(400).json(body);
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`Unhandled error: ${message}`, err);
  const body: ApiErrorBody = { error: 'Internal server error', code: 'INTERNAL' };
  res.status(500).json(body);
}

/** Wrap an async route so thrown errors reach the error handler. */
export function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>>(
  fn: T,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
