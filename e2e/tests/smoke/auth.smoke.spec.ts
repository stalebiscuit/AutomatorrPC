import { test, expect } from '@playwright/test';
import { API_BASE, ADMIN_EMAIL, TEST_HOOKS_ENABLED } from '../../lib/env.js';

/**
 * @smoke — admin auth critical path.
 *
 * The OTP code is emailed, never stored, so we can't read it back. We instead:
 *  1. Prove the OTP-request endpoint works and stays anti-enumerating.
 *  2. Establish a real authenticated session via the E2E test-login hook
 *     (which mints a session through the SAME code path as a real login) and
 *     confirm a guarded endpoint accepts it.
 */
test.describe('@smoke auth', () => {
  test('request-otp responds generically for eligible and ineligible emails @smoke', async ({
    request,
  }) => {
    const eligible = await request.post(`${API_BASE}/admin/auth/request-otp`, {
      data: { email: ADMIN_EMAIL },
    });
    expect(eligible.status()).toBe(200);
    expect((await eligible.json()).ok).toBe(true);

    // Anti-enumeration: an unknown email must return the SAME generic 200.
    const unknown = await request.post(`${API_BASE}/admin/auth/request-otp`, {
      data: { email: 'nobody-1729@example.com' },
    });
    expect(unknown.status()).toBe(200);
    expect((await unknown.json()).ok).toBe(true);
  });

  test('test-login hook yields a session that /admin/auth/me accepts @smoke', async ({
    request,
  }) => {
    test.skip(
      !TEST_HOOKS_ENABLED,
      'E2E_TEST_HOOKS!=true — authenticated-session smoke needs the server test hook.',
    );

    const login = await request.post(`${API_BASE}/test/login`, { data: { email: ADMIN_EMAIL } });
    expect(login.status()).toBe(200);
    expect((await login.json()).user.email.toLowerCase()).toBe(ADMIN_EMAIL.toLowerCase());

    // The `request` context retains the session cookies set above.
    const me = await request.get(`${API_BASE}/admin/auth/me`);
    expect(me.status()).toBe(200);
    const body = await me.json();
    expect(body.authenticated).toBe(true);
    expect(['admin', 'superadmin']).toContain(body.user.role);
  });
});
