import { connect, disconnect, wipeExceptPreserved } from './lib/db.js';
import { ADMIN_EMAIL } from './lib/env.js';

/**
 * Runs once after the whole suite. Wipes test data so nothing accumulates
 * across runs, preserving exactly one real account (a super-admin). The wipe is
 * guarded inside wipeExceptPreserved() so it can only ever touch a disposable
 * e2e database.
 */
export default async function globalTeardown(): Promise<void> {
  const preserved = process.env.E2E_PRESERVED_EMAIL ?? ADMIN_EMAIL;
  await connect();
  try {
    await wipeExceptPreserved(preserved);
    console.log(`[e2e] teardown ok — wiped test data, preserved ${preserved}`);
  } finally {
    await disconnect();
  }
}
