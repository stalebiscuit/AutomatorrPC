import { defineConfig, devices } from '@playwright/test';

/**
 * Minimal e2e config. Assumes the demo API (`npm run dev:demo --workspace server`)
 * on :4000 and the Vite dev server on :5173 are running, or starts Vite itself.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
