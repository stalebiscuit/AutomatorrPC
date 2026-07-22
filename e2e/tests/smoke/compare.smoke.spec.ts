import { test, expect } from '@playwright/test';
import { API_BASE } from '../../lib/env.js';

/**
 * @smoke — Speccify's primary public read path: list parts, then compare two of
 * them. Data-driven off the live catalogue so it never hardcodes part slugs.
 */
test.describe('@smoke compare', () => {
  test('list CPUs then compare the top two @smoke', async ({ request }) => {
    const list = await request.get(`${API_BASE}/components?category=cpu&pageSize=2`);
    expect(list.status()).toBe(200);
    const components = (await list.json()).components ?? [];
    test.skip(components.length < 2, 'Need at least two CPUs in the catalogue to compare.');

    const [a, b] = components;
    const res = await request.get(
      `${API_BASE}/compare?category=cpu&a=${encodeURIComponent(a.slug)}&b=${encodeURIComponent(b.slug)}`,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    // The compare result identifies a winner (or explicit tie) and echoes both.
    expect(body).toBeTruthy();
    const json = JSON.stringify(body);
    expect(json).toContain(a.slug);
    expect(json).toContain(b.slug);
  });
});
