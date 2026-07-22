import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

export const FEEDBACK_TYPES = ['idea', 'bug', 'data', 'other'] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_STATUSES = ['new', 'reviewed', 'done', 'dismissed'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/**
 * User feedback / ideas (launch-polish P4). Public submissions land here and
 * are triaged from the admin "Feedback" tab. `context` is auto-captured by
 * the client so a "wrong data" report points at the exact page it came from.
 */
const FeedbackSchema = new Schema(
  {
    type: { type: String, enum: FEEDBACK_TYPES, required: true },
    message: { type: String, required: true, minlength: 10, maxlength: 2000 },
    email: { type: String, default: '' },
    context: {
      path: { type: String, default: '' },
      category: { type: String, default: '' },
      slugs: { type: [String], default: [] },
      buildShortId: { type: String, default: '' },
    },
    sessionId: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    status: { type: String, enum: FEEDBACK_STATUSES, default: 'new' },
    adminNote: { type: String, default: '', maxlength: 2000 },
  },
  { timestamps: true },
);

FeedbackSchema.index({ status: 1, createdAt: -1 });
FeedbackSchema.index({ type: 1, createdAt: -1 });

export type FeedbackDoc = InferSchemaType<typeof FeedbackSchema>;
export const FeedbackModel: Model<FeedbackDoc> = model<FeedbackDoc>('Feedback', FeedbackSchema);
