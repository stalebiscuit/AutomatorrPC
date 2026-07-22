import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

/**
 * Email domain allow-listed for admin sign-in (spec §3). Anyone whose email
 * domain matches an active entry may request an OTP and sign in as `admin`.
 */
const AllowedDomainSchema = new Schema(
  {
    domain: { type: String, required: true, lowercase: true, trim: true },
    note: { type: String, default: '' },
    createdBy: { type: String, default: '' },
  },
  { timestamps: true },
);

AllowedDomainSchema.index({ domain: 1 }, { unique: true });

export type AllowedDomainDoc = InferSchemaType<typeof AllowedDomainSchema>;
export const AllowedDomainModel: Model<AllowedDomainDoc> = model<AllowedDomainDoc>(
  'AllowedDomain',
  AllowedDomainSchema,
);
