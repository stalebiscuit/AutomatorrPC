import { Router } from 'express';
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
import { createBuildBody, updateBuildBody, buildParams, buildSummaryQuery } from './schemas.js';

export const buildsRouter = Router();

buildsRouter.post(
  '/builds',
  validate({ body: createBuildBody }),
  asyncHandler(async (_req, res) => {
    const { body } = getValidated<unknown, z.infer<typeof createBuildBody>>(res);
    const doc = await createBuild(body);
    const summary = await summarizeBuild(doc.shortId);
    res.status(201).json(summary);
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
  validate({ params: buildParams, body: updateBuildBody }),
  asyncHandler(async (_req, res) => {
    const { params, body } = getValidated<
      unknown,
      z.infer<typeof updateBuildBody>,
      z.infer<typeof buildParams>
    >(res);
    const updated = await updateBuild(params.shortId, body);
    if (!updated) throw ApiError.notFound(`No build "${params.shortId}"`);
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
