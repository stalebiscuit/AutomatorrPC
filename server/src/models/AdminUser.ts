import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

/** Roles. Super-admin is locked to the seeded founders (spec §3). */
export const ADMIN_ROLES = ['superadmin', 'admin'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_USER_SOURCES = ['seed', 'invited', 'domain'] as const;
export type AdminUserSource = (typeof ADMIN_USER_SOURCES)[number];

/**
 * An admin identity. Seeded founders are `superadmin`; everyone else is
 * `admin`. `source` records how the record came to exist: `seed` (founder),
 * `invited` (added on the Users page), or `domain` (auto-provisioned on first
 * login because their email domain is allow-listed).
 */
const AdminUserSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ADMIN_ROLES, required: true, default: 'admin' },
    status: { type: String, enum: ['active', 'disabled'], required: true, default: 'active' },
    source: { type: String, enum: ADMIN_USER_SOURCES, required: true, default: 'invited' },
    displayName: { type: String, default: '' },
    createdBy: { type: String, default: '' },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

AdminUserSchema.index({ email: 1 }, { unique: true });

export type AdminUserDoc = InferSchemaType<typeof AdminUserSchema>;
export const AdminUserModel: Model<AdminUserDoc> = model<AdminUserDoc>('AdminUser', AdminUserSchema);
