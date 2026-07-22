import { test, expect } from '@playwright/test';
import { API_BASE, TEST_HOOKS_ENABLED } from '../../lib/env.js';
import { loginAsAdmin, CSRF } from '../../lib/admin.js';

test.describe('admin: affiliates & analytics', () => {
  test('anonymous is rejected (401)', async ({ request }) => {
    expect((await request.get(`${API_BASE}/admin/affiliates`)).status()).toBe(401);
  });

  test('set an affiliate tag and see it decorate that store’s price links', async ({ request }) => {
    test.skip(!TEST_HOOKS_ENABLED, 'needs E2E_TEST_HOOKS');
    await loginAsAdmin(request);

    const stores = (await (await request.get(`${API_BASE}/admin/affiliates`)).json()).stores as {
      store: string;
    }[];
    expect(stores.length).toBeGreaterThan(0);
    const store = stores[0].store;
    const TAG = 'e2eaff';

    // Configure "tag" mode for that store.
    const put = await request.put(`${API_BASE}/admin/affiliates/${encodeURIComponent(store)}`, {
      headers: CSRF,
      data: { mode: 'tag', paramName: 'tag', tag: TAG },
    });
    expect(put.status()).toBe(200);
    expect((await put.json()).store.mode).toBe('tag');

    // Reflected on read.
    const after = (await (await request.get(`${API_BASE}/admin/affiliates`)).json()).stores as {
      store: string;
      mode: string;
      tag: string;
    }[];
    const saved = after.find((s) => s.store === store);
    expect(saved?.mode).toBe('tag');
    expect(saved?.tag).toBe(TAG);

    // If any listed component has a price from that store, its outbound URL is decorated.
    for (const cat of ['cpu', 'gpu', 'motherboard']) {
      const comps = (await (await request.get(`${API_BASE}/components?category=${cat}&pageSize=20`)).json())
        .components as { prices: { store: string; url: string }[] }[];
      const priced = comps.flatMap((c) => c.prices ?? []).find((p) => p.store === store);
      if (priced) {
        expect(priced.url).toContain(TAG);
        break;
      }
    }

    // Reset so we don't affect other runs.
    await request.put(`${API_BASE}/admin/affiliates/${encodeURIComponent(store)}`, {
      headers: CSRF,
      data: { mode: 'off' },
    });
  });

  test('analytics endpoints return data for a window', async ({ request }) => {
    test.skip(!TEST_HOOKS_ENABLED, 'needs E2E_TEST_HOOKS');
    await loginAsAdmin(request);
    expect((await request.get(`${API_BASE}/admin/analytics?window=week`)).status()).toBe(200);
    expect((await request.get(`${API_BASE}/admin/analytics/builder?window=week`)).status()).toBe(200);
  });
});
