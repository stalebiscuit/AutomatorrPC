import { Router } from 'express';
import type { z } from 'zod';
import { listComponents, getComponent } from '../services/catalog.js';
import { ApiError } from '../lib/ApiError.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validate, getValidated } from '../middleware/validate.js';
import { listComponentsQuery, componentParams } from './schemas.js';

export const componentsRouter = Router();

componentsRouter.get(
  '/components',
  validate({ query: listComponentsQuery }),
  asyncHandler(async (_req, res) => {
    const { query } = getValidated<z.infer<typeof listComponentsQuery>>(res);
    const result = await listComponents(query);
    res.json(result);
  }),
);

componentsRouter.get(
  '/components/:category/:slug',
  validate({ params: componentParams }),
  asyncHandler(async (_req, res) => {
    const { params } = getValidated<unknown, unknown, z.infer<typeof componentParams>>(res);
    const component = await getComponent(params.category, params.slug);
    if (!component) throw ApiError.notFound(`No ${params.category} component "${params.slug}"`);
    res.json({ component });
  }),
);
