import { Router, type RequestHandler } from 'express';
import type { z } from 'zod';
import {
  createBuild,
  updateBuild,
  summarizeBuild,
  merchantBreakdown,
} from '../services/builder/builds.js';
import { ApiError } from '../lib/ApiError.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validate, getValidated } from '../middleware/validate.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { loadConfig } from '../config.js';
import { createBuildBody, updateBuildBody, buildParams, buildSummaryQuery } from './schemas.js';

export const buildsRouter = Router();

// Review fix 1.3: unauthenticated writes get a per-IP throttle (test-bypassed).
const buildsWriteLimiter: RequestHandler =
  loadConfig().NODE_ENV === 'test'
    ? (_req, _res, next) => next()
    : rateLimit({ windowMs: 60 * 60_000, max: 30 });

buildsRouter.post(
  '/builds',
  buildsWriteLimiter,
  validate({ body: createBuildBody }),
  asyncHandler(async (_req, res) => {
    const { body } = getValidated<unknown, z.infer<typeof createBuildBody>>(res);
    const doc = await createBuild(body);
    const summary = await summarizeBuild(doc.shortId);
    // The edit token is returned exactly once, at creation — GET never
    // exposes it, so shared permalinks stay read-only for everyone else.
    res.status(201).json({ ...summary, editToken: doc.editToken });
  }),
);

buildsRouter.get(
  '/builds/:shortId',
  validate({ params: buildParams, query: buildSummaryQuery }),
  asyncHandler(async (_req, res) => {
    const { params, query } = getValidated<
      z.infer<typeof buildSummaryQuery>,
      unknown,
      z.infer<typeof buildParams>
    >(res);
    const summary = await summarizeBuild(params.shortId, query.budget);
    if (!summary) throw ApiError.notFound(`No build "${params.shortId}"`);
    res.json(summary);
  }),
);

buildsRouter.patch(
  '/builds/:shortId',
  buildsWriteLimiter,
  validate({ params: buildParams, body: updateBuildBody }),
  asyncHandler(async (req, res) => {
    const { params, body } = getValidated<
      unknown,
      z.infer<typeof updateBuildBody>,
      z.infer<typeof buildParams>
    >(res);
    const updated = await updateBuild(params.shortId, req.get('x-edit-token') ?? '', body);
    if (updated === 'notfound') throw ApiError.notFound(`No build "${params.shortId}"`);
    if (updated === 'forbidden')
      throw ApiError.forbidden('This build can only be edited with its edit token');
    const summary = await summarizeBuild(params.shortId);
    res.json(summary);
  }),
);

buildsRouter.get(
  '/builds/:shortId/by-merchant',
  validate({ params: buildParams }),
  asyncHandler(async (_req, res) => {
    const { params } = getValidated<unknown, unknown, z.infer<typeof buildParams>>(res);
    const rows = await merchantBreakdown(params.shortId);
    if (!rows) throw ApiError.notFound(`No build "${params.shortId}"`);
    res.json({ merchants: rows });
  }),
);
