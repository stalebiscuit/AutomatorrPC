import { Router } from 'express';
import type { z } from 'zod';
import { recordSearch, recordClick, recordConversion } from '../services/analytics.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validate, getValidated } from '../middleware/validate.js';
import { searchEventBody, clickEventBody, conversionEventBody } from './schemas.js';

export const eventsRouter = Router();

eventsRouter.post(
  '/events/search',
  validate({ body: searchEventBody }),
  asyncHandler(async (_req, res) => {
    const { body } = getValidated<unknown, z.infer<typeof searchEventBody>>(res);
    await recordSearch(body);
    res.status(201).json({ ok: true });
  }),
);

eventsRouter.post(
  '/events/click',
  validate({ body: clickEventBody }),
  asyncHandler(async (_req, res) => {
    const { body } = getValidated<unknown, z.infer<typeof clickEventBody>>(res);
    // Record, then return — the client opens the store URL after this resolves.
    await recordClick(body);
    res.status(201).json({ ok: true });
  }),
);

// Affiliate postback / return-URL hook records a confirmed sale (Task 3.1).
eventsRouter.post(
  '/events/conversion',
  validate({ body: conversionEventBody }),
  asyncHandler(async (_req, res) => {
    const { body } = getValidated<unknown, z.infer<typeof conversionEventBody>>(res);
    await recordConversion(body);
    res.status(201).json({ ok: true });
  }),
);
