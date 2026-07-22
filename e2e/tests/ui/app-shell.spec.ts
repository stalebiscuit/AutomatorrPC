import { test, expect } from '@playwright/test';

/**
 * Full-suite UI check (NOT @smoke): the built SPA shell mounts and renders.
 * Requires the app to be serving the built client at baseURL — the CI
 * single-process app does; locally, point E2E_BASE_URL at the Vite dev server.
 * Deliberately content-agnostic so it stays green through copy/design changes.
 */
test('app shell loads and React mounts', async ({ page }) => {
  const res = await page.goto('/');
  expect(res, 'navigation returned a response').not.toBeNull();
  expect(res!.status()).toBeLessThan(400);

  // React mounts into #root; wait for it to have rendered content.
  const root = page.locator('#root');
  await expect(root).toBeAttached();
  await expect(root).not.toBeEmpty();
  await expect(page).toHaveTitle(/.+/);
});
