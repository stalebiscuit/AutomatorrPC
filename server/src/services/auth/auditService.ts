import { AdminAuditLogModel, type AuditAction } from '../../models/index.js';
import { logger } from '../../lib/logger.js';

export interface AuditInput {
  actorEmail?: string;
  actorUserId?: string | null;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

/** Record an access-control action. Never throws into the caller's flow. */
export async function audit(action: AuditAction, input: AuditInput = {}): Promise<void> {
  try {
    await AdminAuditLogModel.create({
      action,
      actorEmail: input.actorEmail ?? '',
      actorUserId: input.actorUserId ?? null,
      targetType: input.targetType ?? '',
      targetId: input.targetId ?? '',
      metadata: input.metadata ?? {},
      ip: input.ip ?? '',
      userAgent: input.userAgent ?? '',
    });
  } catch (err) {
    logger.warn(`[audit] failed to record ${action}: ${err instanceof Error ? err.message : err}`);
  }
}
