import { test, expect } from '@playwright/test';

/**
 * Happy-path e2e (spec §13 / Phase 9). Requires the demo API on :4000:
 *   npm run dev:demo --workspace server
 */
test('compare flow: pick two CPUs → winner + scorecard + verdict', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Pit any two parts/i })).toBeVisible();

  // First picker
  await page.getByRole('button', { name: /Choose the first component/i }).click();
  await page.getByPlaceholder(/Search CPU/i).fill('14900K');
  await page.getByRole('option', { name: /i9-14900K/i }).click();

  // Second picker
  await page.getByRole('button', { name: /Choose the second component/i }).click();
  await page.getByPlaceholder(/Search CPU/i).fill('7800X3D');
  await page.getByRole('option', { name: /7800X3D/i }).click();

  // Results
  await expect(page.getByText('OUTCLASSES')).toBeVisible();
  await expect(page.getByText('Winner scorecard')).toBeVisible();
  await expect(page.getByText(/further version/i)).toBeVisible(); // placeholder verdict

  // Deep link reflects the selection
  await expect(page).toHaveURL(/\/compare\/cpu\/.*-vs-.*/);
});

test('deep link reproduces a comparison', async ({ page }) => {
  await page.goto('/compare/cpu/intel-core-i9-14900k-vs-amd-ryzen-7-7800x3d');
  await expect(page.getByText('OUTCLASSES')).toBeVisible();
  await expect(page.getByText('Winner scorecard')).toBeVisible();
});
