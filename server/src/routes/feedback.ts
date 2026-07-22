import { Router } from 'express';
import type { z } from 'zod';
import { FeedbackModel } from '../models/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validate, getValidated } from '../middleware/validate.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { feedbackBody } from './schemas.js';

/**
 * Public feedback intake (launch-polish P4).
 *
 * Baseline endpoint hygiene only — length caps (zod), a 5/hour per-IP rate
 * limit, and a silent-drop honeypot. The full bot defence (CAPTCHA etc.) is
 * a separate work package; this route is its intended mount point.
 */
export const feedbackRouter = Router();

feedbackRouter.post(
  '/feedback',
  rateLimit({ windowMs: 60 * 60 * 1000, max: 5 }),
  validate({ body: feedbackBody }),
  asyncHandler(async (req, res) => {
    const { body } = getValidated<unknown, z.infer<typeof feedbackBody>>(res);

    // Honeypot filled → pretend success, store nothing.
    if (body.website) {
      res.status(201).json({ ok: true });
      return;
    }

    await FeedbackModel.create({
      type: body.type,
      message: body.message,
      email: body.email ?? '',
      context: {
        path: body.context?.path ?? '',
        category: body.context?.category ?? '',
        slugs: body.context?.slugs ?? [],
        buildShortId: body.context?.buildShortId ?? '',
      },
      sessionId: body.sessionId ?? '',
      userAgent: (req.headers['user-agent'] ?? '').slice(0, 300),
    });

    res.status(201).json({ ok: true });
  }),
);
