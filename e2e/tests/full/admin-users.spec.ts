import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { API_BASE, TEST_HOOKS_ENABLED } from '../../lib/env.js';
import { loginAsAdmin, CSRF } from '../../lib/admin.js';

test.describe('admin: users', () => {
  test('anonymous is rejected (401)', async ({ request }) => {
    expect((await request.get(`${API_BASE}/admin/users`)).status()).toBe(401);
  });

  test('invite → list → disable → delete; super-admins are protected', async ({ request }) => {
    test.skip(!TEST_HOOKS_ENABLED, 'needs E2E_TEST_HOOKS');
    await loginAsAdmin(request);
    const email = `e2e-${randomUUID().slice(0, 8)}@example.com`;

    // Invited users are always role "admin".
    const created = await request.post(`${API_BASE}/admin/users`, {
      headers: CSRF,
      data: { email, displayName: 'E2E User' },
    });
    expect(created.status()).toBe(201);
    const user = (await created.json()).user;
    expect(user.role).toBe('admin');
    expect(user.status).toBe('active');

    // Appears in the list, alongside the seeded super-admins.
    const list = await request.get(`${API_BASE}/admin/users`);
    const users = (await list.json()).users as { id: string; email: string; role: string }[];
    expect(users.some((u) => u.email === email)).toBe(true);
    const founder = users.find((u) => u.role === 'superadmin');
    expect(founder, 'a seeded super-admin should exist').toBeTruthy();

    // Disable then delete the invited user.
    const disabled = await request.patch(`${API_BASE}/admin/users/${user.id}`, {
      headers: CSRF,
      data: { status: 'disabled' },
    });
    expect(disabled.status()).toBe(200);
    expect((await disabled.json()).user.status).toBe('disabled');

    expect((await request.delete(`${API_BASE}/admin/users/${user.id}`, { headers: CSRF })).status()).toBe(
      200,
    );

    // A super-admin (founder) cannot be deleted.
    const protectedDel = await request.delete(`${API_BASE}/admin/users/${founder!.id}`, {
      headers: CSRF,
    });
    expect(protectedDel.status()).toBe(403);
  });
});
