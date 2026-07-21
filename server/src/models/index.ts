export { ComponentModel, type ComponentDoc } from './Component.js';
export { BuildModel, type BuildDoc } from './Build.js';
export { MatchAliasModel, type MatchAliasDoc } from './MatchAlias.js';
export { MatchReviewModel, type MatchReviewDoc } from './MatchReview.js';
export { VerdictModel, type VerdictDoc } from './Verdict.js';
export { SearchEventModel, type SearchEventDoc } from './SearchEvent.js';
export { ClickEventModel, type ClickEventDoc } from './ClickEvent.js';
export { AffiliateLinkModel, type AffiliateLinkDoc } from './AffiliateLink.js';
export { ConversionEventModel, type ConversionEventDoc } from './ConversionEvent.js';
export { TrendRollupModel, type TrendRollupDoc } from './TrendRollup.js';
export {
  FeedbackModel,
  type FeedbackDoc,
  type FeedbackType,
  type FeedbackStatus,
  FEEDBACK_TYPES,
  FEEDBACK_STATUSES,
} from './Feedback.js';

// ── Admin auth & access control ──
export { AdminUserModel, type AdminUserDoc, type AdminRole, type AdminUserSource } from './AdminUser.js';
export { AllowedDomainModel, type AllowedDomainDoc } from './AllowedDomain.js';
export { AdminOtpModel, type AdminOtpDoc } from './AdminOtp.js';
export { AdminSessionModel, type AdminSessionDoc } from './AdminSession.js';
export { AdminAuditLogModel, type AdminAuditLogDoc, AUDIT_ACTIONS, type AuditAction } from './AdminAuditLog.js';
