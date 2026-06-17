import { Router } from 'express';
import type { z } from 'zod';
import { recordSearch, recordClick } from '../services/analytics.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validate, getValidated } from '../middleware/validate.js';
import { searchEventBody, clickEventBody } from './schemas.js';

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
