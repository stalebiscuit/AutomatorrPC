import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { API_BASE, TEST_HOOKS_ENABLED } from '../../lib/env.js';
import { loginAsAdmin, CSRF } from '../../lib/admin.js';

test.describe('admin: allowed domains', () => {
  test('anonymous requests are rejected (401)', async ({ request }) => {
    const res = await request.get(`${API_BASE}/admin/allowed-domains`);
    expect(res.status()).toBe(401);
  });

  test('CRUD + input normalization (@, casing) + validation', async ({ request }) => {
    test.skip(!TEST_HOOKS_ENABLED, 'needs E2E_TEST_HOOKS');
    await loginAsAdmin(request);
    const uniq = randomUUID().slice(0, 8);

    // Bare domain.
    const bare = `${uniq}-bare.com`;
    const c1 = await request.post(`${API_BASE}/admin/allowed-domains`, {
      headers: CSRF,
      data: { domain: bare },
    });
    expect(c1.status()).toBe(201);
    expect((await c1.json()).domain.domain).toBe(bare);

    // Typed with a leading "@" and mixed case → normalised to bare host.
    const atForm = `${uniq}-at.com`;
    const c2 = await request.post(`${API_BASE}/admin/allowed-domains`, {
      headers: CSRF,
      data: { domain: `@${atForm.toUpperCase()}` },
    });
    expect(c2.status(), 'leading @ and casing should be accepted').toBe(201);
    expect((await c2.json()).domain.domain).toBe(atForm);

    // Duplicate → 409.
    const dup = await request.post(`${API_BASE}/admin/allowed-domains`, {
      headers: CSRF,
      data: { domain: bare },
    });
    expect(dup.status()).toBe(409);

    // Garbage → 400.
    const bad = await request.post(`${API_BASE}/admin/allowed-domains`, {
      headers: CSRF,
      data: { domain: 'not a domain' },
    });
    expect(bad.status()).toBe(400);

    // List includes both, then clean up.
    const list = await request.get(`${API_BASE}/admin/allowed-domains`);
    const domains = (await list.json()).domains as { id: string; domain: string }[];
    const mine = domains.filter((d) => d.domain === bare || d.domain === atForm);
    expect(mine.length).toBe(2);
    for (const d of mine) {
      const del = await request.delete(`${API_BASE}/admin/allowed-domains/${d.id}`, { headers: CSRF });
      expect(del.status()).toBe(200);
    }
  });
});
