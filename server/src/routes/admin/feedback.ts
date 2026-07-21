import { Router } from 'express';
import type { z } from 'zod';
import { FeedbackModel, FEEDBACK_STATUSES } from '../../models/index.js';
import { ApiError } from '../../lib/ApiError.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validate, getValidated } from '../../middleware/validate.js';
import { requireAuth, requireCsrf } from '../../middleware/auth.js';
import { feedbackListQuery, feedbackUpdateBody, objectIdParams } from '../schemas.js';

const PAGE_SIZE = 20;

interface FeedbackListItem {
  id: string;
  type: string;
  message: string;
  email: string;
  context: { path: string; category: string; slugs: string[]; buildShortId: string };
  sessionId: string;
  userAgent: string;
  status: string;
  adminNote: string;
  createdAt: string | null;
  updatedAt: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDto(doc: any): FeedbackListItem {
  return {
    id: String(doc._id),
    type: doc.type,
    message: doc.message,
    email: doc.email ?? '',
    context: {
      path: doc.context?.path ?? '',
      category: doc.context?.category ?? '',
      slugs: doc.context?.slugs ?? [],
      buildShortId: doc.context?.buildShortId ?? '',
    },
    sessionId: doc.sessionId ?? '',
    userAgent: doc.userAgent ?? '',
    status: doc.status,
    adminNote: doc.adminNote ?? '',
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
}

/**
 * Admin feedback triage (launch-polish P4). Visible to every admin — triaging
 * feedback is exactly what invited admins are for — so no requireSuperadmin.
 */
export const adminFeedbackRouter = Router();

adminFeedbackRouter.get(
  '/admin/feedback',
  requireAuth,
  validate({ query: feedbackListQuery }),
  asyncHandler(async (_req, res) => {
    const { query } = getValidated<z.infer<typeof feedbackListQuery>>(res);

    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.type) filter.type = query.type;

    const [items, total, countRows] = await Promise.all([
      FeedbackModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean(),
      FeedbackModel.countDocuments(filter),
      FeedbackModel.aggregate<{ _id: string; n: number }>([
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
    ]);

    const counts: Record<string, number> = {};
    for (const s of FEEDBACK_STATUSES) counts[s] = 0;
    for (const row of countRows) counts[row._id] = row.n;

    res.json({
      feedback: items.map(toDto),
      page: query.page,
      pageSize: PAGE_SIZE,
      total,
      counts,
    });
  }),
);

adminFeedbackRouter.patch(
  '/admin/feedback/:id',
  requireAuth,
  requireCsrf,
  validate({ params: objectIdParams, body: feedbackUpdateBody }),
  asyncHandler(async (_req, res) => {
    const { params, body } = getValidated<
      unknown,
      z.infer<typeof feedbackUpdateBody>,
      z.infer<typeof objectIdParams>
    >(res);

    const patch: Record<string, unknown> = {};
    if (body.status !== undefined) patch.status = body.status;
    if (body.adminNote !== undefined) patch.adminNote = body.adminNote;

    const doc = await FeedbackModel.findByIdAndUpdate(params.id, patch, { new: true }).lean();
    if (!doc) throw ApiError.notFound('Feedback not found');

    res.json({ feedback: toDto(doc) });
  }),
);
