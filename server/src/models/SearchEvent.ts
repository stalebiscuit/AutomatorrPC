import { Schema, model, type InferSchemaType, type Model } from 'mongoose';
import { CATEGORIES } from '@automatorr/shared';

/** Append-only search/view stream (spec §6). No PII — sessionId is anonymous. */
const SearchEventSchema = new Schema(
  {
    type: { type: String, enum: ['search', 'view'], required: true },
    category: { type: String, enum: [...CATEGORIES], required: true },
    componentId: { type: String },
    pairKey: { type: String },
    query: { type: String },
    sessionId: { type: String, required: true },
    ts: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: false },
);

SearchEventSchema.index({ ts: -1 });
SearchEventSchema.index({ category: 1, ts: -1 });
SearchEventSchema.index({ type: 1, ts: -1 });

export type SearchEventDoc = InferSchemaType<typeof SearchEventSchema>;
export const SearchEventModel: Model<SearchEventDoc> = model<SearchEventDoc>(
  'SearchEvent',
  SearchEventSchema,
);
