import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

/**
 * Confirmed listing→canonical overrides (Task 3 §5). Once a human confirms a
 * match, its canonicalKey is stored here so the matcher resolves that listing
 * automatically forever after. Keyed by the listing's canonical key.
 */
const MatchAliasSchema = new Schema(
  {
    canonicalKey: { type: String, required: true },
    slug: { type: String, required: true },
    note: { type: String },
  },
  { timestamps: true, minimize: false },
);

MatchAliasSchema.index({ canonicalKey: 1 }, { unique: true });

export type MatchAliasDoc = InferSchemaType<typeof MatchAliasSchema>;
export const MatchAliasModel: Model<MatchAliasDoc> = model<MatchAliasDoc>(
  'MatchAlias',
  MatchAliasSchema,
);
