import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

/** Every access-control action is recorded here for accountability (spec §6). */
export const AUDIT_ACTIONS = [
  'auth.otp_requested',
  'auth.otp_failed',
  'auth.login',
  'auth.logout',
  'auth.refresh_reuse',
  'domain.create',
  'domain.update',
  'domain.delete',
  'user.create',
  'user.update',
  'user.disable',
  'user.delete',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

const AdminAuditLogSchema = new Schema(
  {
    actorEmail: { type: String, default: '' },
    actorUserId: { type: Schema.Types.ObjectId, default: null },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    targetType: { type: String, default: '' },
    targetId: { type: String, default: '' },
    metadata: { type: Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AdminAuditLogSchema.index({ createdAt: -1 });
AdminAuditLogSchema.index({ action: 1, createdAt: -1 });

export type AdminAuditLogDoc = InferSchemaType<typeof AdminAuditLogSchema>;
export const AdminAuditLogModel: Model<AdminAuditLogDoc> = model<AdminAuditLogDoc>(
  'AdminAuditLog',
  AdminAuditLogSchema,
);
