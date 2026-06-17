import { Router } from 'express';
import type { z } from 'zod';
import type { VerdictResponse } from '@automatorr/shared';
import { getPair } from '../services/catalog.js';
import { compare } from '../services/compare.js';
import { getVerdictProvider } from '../services/verdict/VerdictProvider.js';
import { ApiError } from '../lib/ApiError.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validate, getValidated } from '../middleware/validate.js';
import { comparePairQuery } from './schemas.js';

export const verdictRouter = Router();

verdictRouter.get(
  '/verdict',
  validate({ query: comparePairQuery }),
  asyncHandler(async (_req, res) => {
    const { query } = getValidated<z.infer<typeof comparePairQuery>>(res);
    if (query.a === query.b) {
      throw ApiError.badRequest('Pick two different components', 'SAME_COMPONENT');
    }
    const { a, b } = await getPair(query.category, query.a, query.b);
    if (!a) throw ApiError.notFound(`No ${query.category} component "${query.a}"`);
    if (!b) throw ApiError.notFound(`No ${query.category} component "${query.b}"`);

    const { scorecard } = compare(a, b);
    const verdict = await getVerdictProvider().getVerdict({ a, b, scorecard });

    const body: VerdictResponse = {
      scorecard,
      prose: verdict.prose,
      generated: verdict.generated,
      ...(verdict.model ? { model: verdict.model } : {}),
    };
    res.json(body);
  }),
);
