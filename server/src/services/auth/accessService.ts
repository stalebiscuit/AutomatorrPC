import { loadConfig } from '../../config.js';
import { AdminUserModel, AllowedDomainModel, type AdminRole } from '../../models/index.js';
import type { SessionUser } from './tokenService.js';
import { normalizeEmail, emailDomain } from './util.js';

/** Normalized founder emails (locked super-admins). */
export function founderEmails(): string[] {
  return loadConfig()
    .SUPERADMIN_EMAILS.split(',')
    .map((e) => normalizeEmail(e))
    .filter(Boolean);
}

export function isFounder(email: string): boolean {
  return founderEmails().includes(normalizeEmail(email));
}

export interface Eligibility {
  eligible: boolean;
  role: AdminRole;
  reason: 'user' | 'domain' | 'disabled' | 'none';
}

/**
 * Decide whether an email may sign in (spec §3):
 *   - an explicit, active Users-list entry → eligible with that role;
 *   - an explicit but disabled entry → blocked (disable wins over domain);
 *   - otherwise, an allow-listed domain → eligible as `admin`;
 *   - founders are always eligible as `superadmin` (safety net).
 */
export async function checkEligibility(email: string): Promise<Eligibility> {
  const normEmail = normalizeEmail(email);

  const user = await AdminUserModel.findOne({ email: normEmail });
  if (user) {
    if (user.status !== 'active') return { eligible: false, role: 'admin', reason: 'disabled' };
    return { eligible: true, role: user.role as AdminRole, reason: 'user' };
  }

  const domain = emailDomain(normEmail);
  if (domain) {
    const allowed = await AllowedDomainModel.findOne({ domain });
    if (allowed) {
      return { eligible: true, role: isFounder(normEmail) ? 'superadmin' : 'admin', reason: 'domain' };
    }
  }

  if (isFounder(normEmail)) return { eligible: true, role: 'superadmin', reason: 'user' };
  return { eligible: false, role: 'admin', reason: 'none' };
}

/**
 * Resolve the AdminUser for a just-verified login, auto-provisioning a record
 * for domain-based logins so the Users page reflects everyone with access.
 * Returns null if the (now-existing) user is disabled.
 */
export async function resolveOnLogin(email: string): Promise<SessionUser | null> {
  const normEmail = normalizeEmail(email);
  const now = new Date();

  const existing = await AdminUserModel.findOne({ email: normEmail });
  if (existing) {
    if (existing.status !== 'active') return null;
    existing.lastLoginAt = now;
    await existing.save();
    return { userId: String(existing._id), email: existing.email, role: existing.role as AdminRole };
  }

  const founder = isFounder(normEmail);
  const created = await AdminUserModel.create({
    email: normEmail,
    role: founder ? 'superadmin' : 'admin',
    status: 'active',
    source: founder ? 'seed' : 'domain',
    lastLoginAt: now,
  });
  return { userId: String(created._id), email: created.email, role: created.role as AdminRole };
}
