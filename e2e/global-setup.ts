import type { FullConfig } from '@playwright/test';
import { connect, disconnect, E2E_MONGO_URI, assertWipeSafe } from './lib/db.js';
import { ensureFixture } from './lib/fixture.js';

/**
 * Runs once before the whole suite. Connects to the ephemeral e2e Mongo,
 * asserts it is a safe (disposable) target, seeds/verifies the deterministic
 * fixture, and stashes the preserved account for teardown.
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  // Fail fast if the target DB looks real — before we touch anything.
  assertWipeSafe(E2E_MONGO_URI);
  await connect();
  try {
    const info = await ensureFixture();
    process.env.E2E_PRESERVED_EMAIL = info.preservedEmail;
    console.log(
      `[e2e] setup ok — db=${E2E_MONGO_URI.split('/').pop()} components=${info.componentCount} preserved=${info.preservedEmail}`,
    );
  } finally {
    await disconnect();
  }
}
