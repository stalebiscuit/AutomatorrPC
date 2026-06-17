import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

/** Periodic aggregation for fast dashboard reads (spec §6). */
const TrendRollupSchema = new Schema(
  {
    window: { type: String, enum: ['day', 'week'], required: true },
    date: { type: Date, required: true },
    metric: {
      type: String,
      enum: ['topComponents', 'topStores', 'searchVolume', 'topComparisons'],
      required: true,
    },
    data: {
      type: [
        new Schema(
          { key: { type: String, required: true }, count: { type: Number, required: true } },
          { _id: false },
        ),
      ],
      default: [],
    },
    generatedAt: { type: Date, required: true },
  },
  { timestamps: false },
);

TrendRollupSchema.index({ window: 1, metric: 1, date: -1 });

export type TrendRollupDoc = InferSchemaType<typeof TrendRollupSchema>;
export const TrendRollupModel: Model<TrendRollupDoc> = model<TrendRollupDoc>(
  'TrendRollup',
  TrendRollupSchema,
);
