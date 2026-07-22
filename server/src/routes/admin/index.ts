import { Router } from 'express';
import type { z } from 'zod';
import { ApiError } from '../../lib/ApiError.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validate, getValidated } from '../../middleware/validate.js';
import { requireAuth, requireCsrf } from '../../middleware/auth.js';
import { getAnalytics, getBuilderAnalytics } from '../../services/analytics.js';
import {
  listAffiliateConfigs,
  upsertAffiliateConfig,
} from '../../services/affiliate/affiliateService.js';
import { analyticsQuery, affiliateStoreParams, affiliateUpdateBody } from '../schemas.js';
import { adminAuthRouter } from './auth.js';
import { allowedDomainsRouter } from './domains.js';
import { adminUsersRouter } from './users.js';
import { adminFeedbackRouter } from './feedback.js';

/** Everything under /api/admin — auth, management, and the existing dashboards. */
export const adminRouter = Router();

adminRouter.use(adminAuthRouter);
adminRouter.use(allowedDomainsRouter);
adminRouter.use(adminUsersRouter);
adminRouter.use(adminFeedbackRouter);

adminRouter.get(
  '/admin/analytics',
  requireAuth,
  validate({ query: analyticsQuery }),
  asyncHandler(async (_req, res) => {
    const { query } = getValidated<z.infer<typeof analyticsQuery>>(res);
    res.json(await getAnalytics(query.window));
  }),
);

adminRouter.get(
  '/admin/analytics/builder',
  requireAuth,
  validate({ query: analyticsQuery }),
  asyncHandler(async (_req, res) => {
    const { query } = getValidated<z.infer<typeof analyticsQuery>>(res);
    res.json(await getBuilderAnalytics(query.window));
  }),
);

adminRouter.get(
  '/admin/affiliates',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json({ stores: await listAffiliateConfigs() });
  }),
);

adminRouter.put(
  '/admin/affiliates/:store',
  requireAuth,
  requireCsrf,
  validate({ params: affiliateStoreParams, body: affiliateUpdateBody }),
  asyncHandler(async (_req, res) => {
    const { params, body } = getValidated<
      unknown,
      z.infer<typeof affiliateUpdateBody>,
      z.infer<typeof affiliateStoreParams>
    >(res);
    const saved = await upsertAffiliateConfig(params.store, body);
    if (!saved) throw ApiError.notFound(`Unknown store "${params.store}"`);
    res.json({ store: saved });
  }),
);
