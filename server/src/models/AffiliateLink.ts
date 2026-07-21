import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

/** Per-retailer affiliate configuration (admin-managed). One doc per store. */
const AffiliateLinkSchema = new Schema(
  {
    store: { type: String, required: true },
    mode: { type: String, enum: ['off', 'tag', 'wrapper'], required: true, default: 'off' },
    paramName: { type: String, default: 'tag' },
    tag: { type: String, default: '' },
    wrapperTemplate: { type: String, default: '' },
  },
  { timestamps: true },
);

AffiliateLinkSchema.index({ store: 1 }, { unique: true });

export type AffiliateLinkDoc = InferSchemaType<typeof AffiliateLinkSchema>;
export const AffiliateLinkModel: Model<AffiliateLinkDoc> = model<AffiliateLinkDoc>(
  'AffiliateLink',
  AffiliateLinkSchema,
);
