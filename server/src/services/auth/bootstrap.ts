import { AdminUserModel } from '../../models/index.js';
import { logger } from '../../lib/logger.js';
import { founderEmails } from './accessService.js';

/**
 * Seed (and re-assert) the locked founder super-admins. Idempotent: on every
 * boot it guarantees each founder exists as an active `superadmin`, so they
 * can never be locked out or downgraded. Safe to call repeatedly.
 */
export async function seedSuperadmins(): Promise<void> {
  const emails = founderEmails();
  for (const email of emails) {
    await AdminUserModel.updateOne(
      { email },
      { $set: { role: 'superadmin', status: 'active', source: 'seed' } },
      { upsert: true },
    );
  }
  if (emails.length) logger.info(`Super-admins ensured (${emails.length})`);
}
