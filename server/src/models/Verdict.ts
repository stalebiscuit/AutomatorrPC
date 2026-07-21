import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

/** Verdict prose cache — dormant until the Claude provider lands (spec §6, §14). */
const VerdictSchema = new Schema(
  {
    pairKey: { type: String, required: true }, // `${category}:${slugLow}|${slugHigh}`
    prose: { type: String, required: true },
    model: { type: String, required: true },
    generatedAt: { type: Date, required: true },
  },
  { timestamps: false },
);

VerdictSchema.index({ pairKey: 1 }, { unique: true });

export type VerdictDoc = InferSchemaType<typeof VerdictSchema>;
export const VerdictModel: Model<VerdictDoc> = model<VerdictDoc>('Verdict', VerdictSchema);
