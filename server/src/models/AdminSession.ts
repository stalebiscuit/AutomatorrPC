import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

/**
 * A refresh-token in a rotating family (spec §5). Only the sha256 hash of the
 * opaque refresh token is stored. Each rotation issues a new row in the same
 * `familyId`; presenting an already-rotated token revokes the whole family
 * (reuse detection). `absoluteExpiresAt` is the 8-hour hard session cap and
 * also drives TTL cleanup.
 */
const AdminSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'AdminUser', required: true },
    email: { type: String, required: true, lowercase: true },
    familyId: { type: String, required: true },
    tokenHash: { type: String, required: true },
    issuedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true },
    rotatedFromId: { type: Schema.Types.ObjectId, default: null },
    rotatedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    ip: { type: String, default: '' },
  },
  { timestamps: true },
);

AdminSessionSchema.index({ tokenHash: 1 }, { unique: true });
AdminSessionSchema.index({ familyId: 1 });
AdminSessionSchema.index({ userId: 1 });
// TTL: clear sessions once past the absolute 8h cap.
AdminSessionSchema.index({ absoluteExpiresAt: 1 }, { expireAfterSeconds: 0 });

export type AdminSessionDoc = InferSchemaType<typeof AdminSessionSchema>;
export const AdminSessionModel: Model<AdminSessionDoc> = model<AdminSessionDoc>(
  'AdminSession',
  AdminSessionSchema,
);
