import mongoose from 'mongoose';
import { API_BASE, ADMIN_EMAIL } from './env.js';

/**
 * Deterministic baseline the suite assumes exists:
 *  - the preserved super-admin (auto-seeded by the server at boot), and
 *  - a populated parts catalogue (the pipeline runs `seed:sample` against the
 *    e2e DB before tests; locally, `npm run seed:sample --workspace server`).
 *
 * Speccify has no end-user accounts (public traffic is anonymous), so the
 * "org/admin/user" triple from the reference project maps to just the admin +
 * catalogue here. We verify rather than insert catalogue docs directly, to
 * avoid coupling the E2E package to the server's Mongoose schemas.
 */
export interface FixtureInfo {
  preservedEmail: string;
  componentCount: number;
}

export async function ensureFixture(): Promise<FixtureInfo> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('[e2e/fixture] Not connected to Mongo.');

  const componentCount = await db.collection('components').countDocuments();
  if (componentCount === 0) {
    // Not fatal — some suites (health/auth) don't need the catalogue — but loud,
    // because the compare/build smoke tests will fail without it.
    console.warn(
      '[e2e/fixture] components collection is EMPTY. Run `seed:sample` against the e2e DB ' +
        'before the suite (the pipeline does this automatically).',
    );
  }

  // Confirm the API is actually reachable and healthy before any test runs, so
  // an env/startup problem fails here with a clear message rather than as 40
  // confusing test failures.
  const res = await fetch(`${API_BASE}/health`).catch((e: unknown) => {
    throw new Error(`[e2e/fixture] Could not reach ${API_BASE}/health — is the app running? ${String(e)}`);
  });
  if (!res.ok) throw new Error(`[e2e/fixture] ${API_BASE}/health returned ${res.status}`);

  return { preservedEmail: ADMIN_EMAIL, componentCount };
}
