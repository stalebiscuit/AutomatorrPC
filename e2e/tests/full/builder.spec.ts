import { test, expect } from '@playwright/test';
import { API_BASE } from '../../lib/env.js';

/** PC Builder flow (full suite). */
test.describe('PC builder', () => {
  test('builder categories are exposed', async ({ request }) => {
    const res = await request.get(`${API_BASE}/builder/categories`);
    expect(res.status()).toBe(200);
    const { categories } = await res.json();
    expect(Array.isArray(categories)).toBe(true);
    expect(categories.length).toBeGreaterThan(0);
  });

  test('build lifecycle: create with parts → read → by-merchant → update → guard', async ({
    request,
  }) => {
    // Grab one CPU + one GPU to populate the build.
    const cpu = (await (await request.get(`${API_BASE}/components?category=cpu&pageSize=1`)).json())
      .components[0];
    const gpu = (await (await request.get(`${API_BASE}/components?category=gpu&pageSize=1`)).json())
      .components[0];
    const items = [
      { category: 'cpu', slug: cpu.slug },
      { category: 'gpu', slug: gpu.slug },
    ];

    const created = await request.post(`${API_BASE}/builds`, {
      data: { name: 'e2e-rig', budget: 3000, items },
    });
    expect(created.status()).toBe(201);
    const cb = await created.json();
    const shortId = cb.build.shortId;
    const editToken = cb.editToken;
    expect(shortId).toBeTruthy();
    expect(cb.build.items.length).toBe(2);

    // Read back (no edit token leaked).
    const read = await request.get(`${API_BASE}/builds/${shortId}`);
    expect(read.status()).toBe(200);
    expect((await read.json()).editToken).toBeUndefined();

    // By-merchant breakdown.
    const byMerchant = await request.get(`${API_BASE}/builds/${shortId}/by-merchant`);
    expect(byMerchant.status()).toBe(200);
    expect(Array.isArray((await byMerchant.json()).merchants)).toBe(true);

    // Update budget + name with the edit token.
    const upd = await request.patch(`${API_BASE}/builds/${shortId}`, {
      headers: { 'x-edit-token': editToken },
      data: { name: 'e2e-rig-v2', budget: 3500 },
    });
    expect(upd.status()).toBe(200);
    expect((await upd.json()).build.name).toBe('e2e-rig-v2');

    // Update without the token → 403.
    const forbidden = await request.patch(`${API_BASE}/builds/${shortId}`, {
      headers: { 'x-edit-token': 'nope' },
      data: { name: 'hacked' },
    });
    expect(forbidden.status()).toBe(403);

    // Unknown build → 404.
    expect((await request.get(`${API_BASE}/builds/zzzzzzzz`)).status()).toBe(404);
  });
});
