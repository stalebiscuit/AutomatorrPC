import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

/**
 * A one-time login code. The code itself is never stored — only a salted
 * sha256 hash. Auto-expires via a TTL index on `expiresAt` (spec §4).
 */
const AdminOtpSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    codeHash: { type: String, required: true },
    salt: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, required: true, default: 0 },
    maxAttempts: { type: Number, required: true, default: 5 },
    consumedAt: { type: Date, default: null },
    requestIp: { type: String, default: '' },
  },
  { timestamps: true },
);

AdminOtpSchema.index({ email: 1, createdAt: -1 });
// TTL: remove documents once past their expiry (Mongo sweeps ~every 60s).
AdminOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type AdminOtpDoc = InferSchemaType<typeof AdminOtpSchema>;
export const AdminOtpModel: Model<AdminOtpDoc> = model<AdminOtpDoc>('AdminOtp', AdminOtpSchema);
