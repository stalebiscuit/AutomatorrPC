/**
 * Central resolution of "what am I testing and where". All values come from the
 * environment so the same suite runs locally (against `npm run dev`) and in CI
 * (against the built single-process app on the ephemeral e2e DB).
 */

/** Base URL of the app under test. In CI the single Node process serves both
 *  the client and /api on this origin. */
export const APP_BASE_URL =
  process.env.E2E_BASE_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:4000';

/** Same-origin API root. */
export const API_BASE = `${APP_BASE_URL}/api`;

/** A seeded, eligible super-admin used by the auth smoke test + test-login hook. */
export const ADMIN_EMAIL =
  process.env.E2E_ADMIN_EMAIL ?? 'daniel.hardman@automatorr.com';

/** Whether the server exposes the E2E test hooks (POST /api/test/login etc.). */
export const TEST_HOOKS_ENABLED = process.env.E2E_TEST_HOOKS === 'true';

/** True when running inside Azure Pipelines (or any CI). */
export const IS_CI = process.env.CI === 'true' || process.env.TF_BUILD === 'True';
