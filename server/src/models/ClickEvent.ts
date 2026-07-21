import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

/** Append-only price-link click stream (spec §6). */
const ClickEventSchema = new Schema(
  {
    componentId: { type: String, required: true },
    store: { type: String, required: true },
    url: { type: String, required: true },
    sessionId: { type: String, required: true },
    ts: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: false },
);

ClickEventSchema.index({ ts: -1 });
ClickEventSchema.index({ store: 1, ts: -1 });
ClickEventSchema.index({ componentId: 1, ts: -1 });

export type ClickEventDoc = InferSchemaType<typeof ClickEventSchema>;
export const ClickEventModel: Model<ClickEventDoc> = model<ClickEventDoc>(
  'ClickEvent',
  ClickEventSchema,
);
