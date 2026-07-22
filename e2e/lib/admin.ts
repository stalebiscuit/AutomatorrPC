import type { APIRequestContext } from '@playwright/test';
import { API_BASE, ADMIN_EMAIL } from './env.js';

/**
 * CSRF header required on guarded admin writes (paired with SameSite cookies).
 * Harmless on GETs, so we attach it to every admin call in tests.
 */
export const CSRF = { 'x-csrf': '1' };

/**
 * Establish a real super-admin session on the given request context via the
 * E2E test-login hook (mints a session through the same code path as a real
 * login). The context then carries the session cookies for subsequent calls.
 */
export async function loginAsAdmin(request: APIRequestContext, email = ADMIN_EMAIL): Promise<void> {
  const res = await request.post(`${API_BASE}/test/login`, { data: { email } });
  if (!res.ok()) throw new Error(`test-login failed (${res.status()}) — is E2E_TEST_HOOKS=true?`);
}
