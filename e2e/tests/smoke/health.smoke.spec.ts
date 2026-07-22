import { test, expect } from '@playwright/test';
import { API_BASE } from '../../lib/env.js';

/**
 * @smoke — the gate's fail-fast baseline. If the env itself is broken (app down,
 * DB unreachable), this fails first with a clear signal instead of 40 confusing
 * downstream failures.
 */
test.describe('@smoke health', () => {
  test('GET /health reports ok and a connected DB @smoke', async ({ request }) => {
    const res = await request.get(`${API_BASE}/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('connected');
  });

  test('GET /categories returns the catalogue categories (DB read path) @smoke', async ({
    request,
  }) => {
    const res = await request.get(`${API_BASE}/categories`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.categories)).toBe(true);
    expect(body.categories.length).toBeGreaterThan(0);
  });
});
