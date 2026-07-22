import { Router, type RequestHandler } from 'express';
import type { z } from 'zod';
import { recordSearch, recordClick, recordConversion } from '../services/analytics.js';
import { ApiError } from '../lib/ApiError.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validate, getValidated } from '../middleware/validate.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { loadConfig } from '../config.js';
import { searchEventBody, clickEventBody, conversionEventBody } from './schemas.js';

export const eventsRouter = Router();

// Review fix 1.2: the append-only event streams were completely unthrottled —
// anyone could flood them and poison the analytics dashboard. Per-IP limits
// (generous for humans, hostile to floods), disabled under test.
const passthrough: RequestHandler = (_req, _res, next) => next();
const isTest = loadConfig().NODE_ENV === 'test';
const eventsLimiter: RequestHandler = isTest
  ? passthrough
  : rateLimit({ windowMs: 60_000, max: 60 });
const conversionLimiter: RequestHandler = isTest
  ? passthrough
  : rateLimit({ windowMs: 60_000, max: 10 });

/** Conversions are an affiliate postback — when a shared secret is configured,
 *  require it so competitors can't forge your conversion funnel. */
const requireConversionSecret: RequestHandler = (req, _res, next) => {
  const secret = loadConfig().CONVERSION_WEBHOOK_SECRET;
  if (secret && req.get('x-conversion-secret') !== secret) {
    next(ApiError.unauthorized('Invalid conversion secret'));
    return;
  }
  next();
};

eventsRouter.post(
  '/events/search',
  eventsLimiter,
  validate({ body: searchEventBody }),
  asyncHandler(async (_req, res) => {
    const { body } = getValidated<unknown, z.infer<typeof searchEventBody>>(res);
    await recordSearch(body);
    res.status(201).json({ ok: true });
  }),
);

eventsRouter.post(
  '/events/click',
  eventsLimiter,
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
  conversionLimiter,
  requireConversionSecret,
  validate({ body: conversionEventBody }),
  asyncHandler(async (_req, res) => {
    const { body } = getValidated<unknown, z.infer<typeof conversionEventBody>>(res);
    await recordConversion(body);
    res.status(201).json({ ok: true });
  }),
);
