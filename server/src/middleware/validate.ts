import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny, z } from 'zod';

interface Schemas {
  query?: ZodTypeAny;
  body?: ZodTypeAny;
  params?: ZodTypeAny;
}

/** Type-safe accessors for validated input, attached to res.locals.validated. */
export interface Validated<Q = unknown, B = unknown, P = unknown> {
  query: Q;
  body: B;
  params: P;
}

/**
 * Validate request parts with zod. On success the parsed values are placed on
 * `res.locals.validated`; on failure a ZodError bubbles to the error handler.
 */
export function validate(schemas: Schemas) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validated: Validated = {
        query: schemas.query ? schemas.query.parse(req.query) : req.query,
        body: schemas.body ? schemas.body.parse(req.body) : req.body,
        params: schemas.params ? schemas.params.parse(req.params) : req.params,
      };
      res.locals.validated = validated;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function getValidated<Q = unknown, B = unknown, P = unknown>(
  res: Response,
): Validated<Q, B, P> {
  return res.locals.validated as Validated<Q, B, P>;
}

export type Infer<T extends ZodTypeAny> = z.infer<T>;
