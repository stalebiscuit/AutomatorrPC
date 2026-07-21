import { Schema, model, type InferSchemaType, type Model } from 'mongoose';
import { BUILDER_CATEGORIES } from '@automatorr/shared';

/**
 * Manual-review queue (Task 3 §5). Retailer listings the matcher couldn't
 * confidently resolve land here for a human to confirm/reject. Confirming writes
 * a MatchAlias so the next occurrence auto-resolves. Deduped by listing+store.
 */
const MatchReviewSchema = new Schema(
  {
    category: { type: String, enum: [...BUILDER_CATEGORIES], required: true },
    /** canonicalKey of the listing (identity for dedupe + alias write) */
    listingKey: { type: String, required: true },
    brand: { type: String, required: true },
    name: { type: String, required: true },
    store: { type: String, required: true, default: 'unknown' },
    url: { type: String },
    price: { type: Number },
    /** the matcher's best (sub-threshold) guess, if any */
    suggestedSlug: { type: String },
    score: { type: Number, required: true, default: 0 },
    status: { type: String, enum: ['pending', 'confirmed', 'rejected'], default: 'pending', required: true },
    /** slug a human confirmed this listing maps to */
    resolvedSlug: { type: String },
  },
  { timestamps: true, minimize: false },
);

MatchReviewSchema.index({ listingKey: 1, store: 1 }, { unique: true });
MatchReviewSchema.index({ status: 1, updatedAt: -1 });

export type MatchReviewDoc = InferSchemaType<typeof MatchReviewSchema>;
export const MatchReviewModel: Model<MatchReviewDoc> = model<MatchReviewDoc>(
  'MatchReview',
  MatchReviewSchema,
);
