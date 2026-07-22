import { test, expect } from '@playwright/test';
import { API_BASE } from '../../lib/env.js';

/**
 * @smoke — Speccify's core create → read → update flow (saved PC builds).
 * Data-driven: it discovers a real part from the catalogue rather than
 * hardcoding a slug, so it stays green as the catalogue changes.
 */
test.describe('@smoke builds', () => {
  test('create → read → update a build @smoke', async ({ request }) => {
    // Discover a real CPU slug to put in the build (optional — build can be empty).
    const list = await request.get(`${API_BASE}/components?category=cpu&pageSize=1`);
    expect(list.status()).toBe(200);
    const first = (await list.json()).components?.[0];
    const items = first ? [{ category: 'cpu', slug: first.slug }] : [];

    // CREATE — the summary envelope is { build, parts, ..., editToken }, where
    // editToken is returned exactly once (top level) and the build lives under `build`.
    const created = await request.post(`${API_BASE}/builds`, {
      data: { name: 'e2e-smoke-build', items },
    });
    expect(created.status()).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.build.shortId).toBeTruthy();
    expect(createdBody.editToken).toBeTruthy();
    const shortId = createdBody.build.shortId;
    const editToken = createdBody.editToken;

    // READ (permalink must NOT expose the edit token)
    const read = await request.get(`${API_BASE}/builds/${shortId}`);
    expect(read.status()).toBe(200);
    const readBody = await read.json();
    expect(readBody.build.shortId).toBe(shortId);
    expect(readBody.editToken).toBeUndefined();

    // UPDATE (requires the edit token header)
    const updated = await request.patch(`${API_BASE}/builds/${shortId}`, {
      headers: { 'x-edit-token': editToken },
      data: { name: 'e2e-smoke-build-renamed' },
    });
    expect(updated.status()).toBe(200);
    expect((await updated.json()).build.name).toBe('e2e-smoke-build-renamed');

    // UPDATE without the token must be rejected.
    const forbidden = await request.patch(`${API_BASE}/builds/${shortId}`, {
      headers: { 'x-edit-token': 'wrong-token' },
      data: { name: 'nope' },
    });
    expect(forbidden.status()).toBe(403);
  });
});
