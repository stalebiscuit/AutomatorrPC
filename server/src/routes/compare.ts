import { Router } from 'express';
import type { z } from 'zod';
import { getPair } from '../services/catalog.js';
import { compare } from '../services/compare.js';
import { ApiError } from '../lib/ApiError.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validate, getValidated } from '../middleware/validate.js';
import { comparePairQuery } from './schemas.js';

export const compareRouter = Router();

compareRouter.get(
  '/compare',
  validate({ query: comparePairQuery }),
  asyncHandler(async (_req, res) => {
    const { query } = getValidated<z.infer<typeof comparePairQuery>>(res);
    if (query.a === query.b) {
      throw ApiError.badRequest('Pick two different components', 'SAME_COMPONENT');
    }
    const { a, b } = await getPair(query.category, query.a, query.b);
    if (!a) throw ApiError.notFound(`No ${query.category} component "${query.a}"`);
    if (!b) throw ApiError.notFound(`No ${query.category} component "${query.b}"`);

    res.json(compare(a, b));
  }),
);
