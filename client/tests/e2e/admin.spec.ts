import { test, expect } from '@playwright/test';

/** Admin happy-path (Phase 9). Demo creds from devServer: admin / demo-password. */
test('unauthorised /admin redirects to login', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole('heading', { name: /Admin sign-in/i })).toBeVisible();
});

test('login → dashboard shows aggregated analytics', async ({ page }) => {
  await page.goto('/admin/login');
  await page.fill('#u', 'admin');
  await page.fill('#p', 'demo-password');
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
  await expect(page.getByText('Search volume', { exact: true })).toBeVisible();
  await expect(page.getByText('Top stores by clicks')).toBeVisible();
});

test('bad credentials show an error', async ({ page }) => {
  await page.goto('/admin/login');
  await page.fill('#u', 'admin');
  await page.fill('#p', 'wrong-password');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByText(/Invalid credentials/i)).toBeVisible();
});
