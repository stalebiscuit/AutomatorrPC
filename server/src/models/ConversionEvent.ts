import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

/**
 * Append-only conversion (sale) stream — an affiliate postback / return-URL hit
 * attributed to a prior price click. Pairs with ClickEvent to measure click→sale
 * conversion per store. No PII beyond the anonymous sessionId. (Task 3.1)
 */
const ConversionEventSchema = new Schema(
  {
    componentId: { type: String },
    store: { type: String, required: true },
    url: { type: String },
    orderRef: { type: String },
    value: { type: Number },
    sessionId: { type: String },
    ts: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: false },
);

ConversionEventSchema.index({ ts: -1 });
ConversionEventSchema.index({ store: 1, ts: -1 });

export type ConversionEventDoc = InferSchemaType<typeof ConversionEventSchema>;
export const ConversionEventModel: Model<ConversionEventDoc> = model<ConversionEventDoc>(
  'ConversionEvent',
  ConversionEventSchema,
);
