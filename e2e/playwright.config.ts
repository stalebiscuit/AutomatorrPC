import { defineConfig, devices } from '@playwright/test';
import { APP_BASE_URL, IS_CI } from './lib/env.js';

/**
 * Speccify E2E config.
 *
 * - Reporters: list + html always; json (feeds the evidence PDF) + a custom
 *   Azure DevOps Test Run reporter always (it no-ops cleanly with no PAT);
 *   junit ONLY in CI (for the pipeline's PublishTestResults task).
 * - screenshot: 'on' in CI (every UI test's shot embeds in the evidence PDF);
 *   'only-on-failure' locally so dev runs stay lean.
 * - retries: 2 in CI (absorb hosted-agent flake); 0 locally (a real break must
 *   fail every attempt — retries are not a way to hide bugs).
 * - ONE project on purpose: introducing multiple Playwright projects triggers
 *   the `--ui` last-used-project-filter caching quirk (pitfall #5).
 * - The fast @smoke subset (run via `--grep @smoke`) is what gate mode runs.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: IS_CI,
  retries: IS_CI ? 2 : 0,
  workers: IS_CI ? 2 : undefined,
  timeout: 30_000,
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  outputDir: './results/artifacts',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'results/html', open: 'never' }],
    ['json', { outputFile: 'results/e2e-results.json' }],
    ['./azdo/reporter.js'],
    ...(IS_CI ? [['junit', { outputFile: 'results/junit.xml' }] as const] : []),
  ],
  use: {
    baseURL: APP_BASE_URL,
    trace: 'on-first-retry',
    screenshot: IS_CI ? 'on' : 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
