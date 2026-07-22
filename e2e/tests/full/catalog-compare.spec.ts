import { test, expect } from '@playwright/test';
import { API_BASE } from '../../lib/env.js';

/** Public catalogue + comparison surface (full suite). */
test.describe('catalogue & compare', () => {
  test('categories list is populated', async ({ request }) => {
    const res = await request.get(`${API_BASE}/categories`);
    expect(res.status()).toBe(200);
    const { categories } = await res.json();
    expect(categories.map((c: { id: string }) => c.id)).toContain('cpu');
  });

  test('component list filters, paginates, and detail resolves', async ({ request }) => {
    const list = await request.get(`${API_BASE}/components?category=gpu&pageSize=3`);
    expect(list.status()).toBe(200);
    const body = await list.json();
    expect(body.pageSize).toBe(3);
    expect(body.components.length).toBeGreaterThan(0);
    const slug = body.components[0].slug;

    const detail = await request.get(`${API_BASE}/components/gpu/${slug}`);
    expect(detail.status()).toBe(200);
    expect((await detail.json()).component.slug).toBe(slug);

    // Unknown slug → 404.
    const missing = await request.get(`${API_BASE}/components/gpu/definitely-not-a-real-slug`);
    expect(missing.status()).toBe(404);
  });

  test('search query narrows results', async ({ request }) => {
    const res = await request.get(`${API_BASE}/components?category=cpu&q=ryzen&pageSize=5`);
    expect(res.status()).toBe(200);
    const { components } = await res.json();
    for (const c of components) {
      expect(`${c.brand} ${c.name}`.toLowerCase()).toContain('ryzen');
    }
  });

  test('compare + verdict for two CPUs', async ({ request }) => {
    const list = await request.get(`${API_BASE}/components?category=cpu&pageSize=2`);
    const [a, b] = (await list.json()).components;
    const cmp = await request.get(
      `${API_BASE}/compare?category=cpu&a=${encodeURIComponent(a.slug)}&b=${encodeURIComponent(b.slug)}`,
    );
    expect(cmp.status()).toBe(200);
    const json = JSON.stringify(await cmp.json());
    expect(json).toContain(a.slug);
    expect(json).toContain(b.slug);

    const verdict = await request.get(
      `${API_BASE}/verdict?category=cpu&a=${encodeURIComponent(a.slug)}&b=${encodeURIComponent(b.slug)}`,
    );
    expect(verdict.status()).toBe(200);
  });
});
