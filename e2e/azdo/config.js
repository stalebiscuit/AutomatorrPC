import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Central Azure DevOps configuration, read from the environment. Loads the
 * gitignored e2e/.env (for local runs) then falls back to real env vars (CI).
 *
 * `hasPat()` lets every other script no-op cleanly when no PAT is configured —
 * we NEVER hard-fail a local run just because Azure DevOps isn't wired up.
 */
const moduleDir = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(moduleDir, '..', '.env') });

const orgUrl = (process.env.AZDO_ORG_URL ?? 'https://dev.azure.com/automatorr').replace(/\/$/, '');

export const config = {
  orgUrl,
  project: process.env.AZDO_PROJECT ?? 'AutomatorrSpeccify',
  planName: process.env.AZDO_PLAN_NAME ?? 'Speccify Regression',
  pat: process.env.AZURE_DEVOPS_PAT ?? '',
  apiVersion: '7.1',

  /** Work item type the coverage gate treats as a "board ticket". */
  ticketWorkItemType: process.env.AZDO_TICKET_TYPE ?? 'Task',
  /** States considered CLOSED (process-agnostic across Basic/Agile/Scrum). */
  closedStates: ['Done', 'Closed', 'Removed', 'Resolved'],
  /** Tag on a ticket that opts it out of the coverage requirement. */
  noTestTag: 'no-test',

  // Azure Pipelines predefined vars (present only inside a pipeline run).
  buildId: process.env.BUILD_BUILDID ?? '',
  buildNumber: process.env.BUILD_BUILDNUMBER ?? '',
  isCi: process.env.TF_BUILD === 'True' || process.env.CI === 'true',

  // Emergency escape hatch for the coverage gate (logged loudly wherever used).
  gateSkip: process.env.AZDO_GATE_SKIP === 'true',
};

export function hasPat() {
  return Boolean(config.pat && config.pat.trim().length > 0);
}

/** vstfs build URI used to filter Test Runs belonging to THIS build (see attach-evidence). */
export function buildUri() {
  return config.buildId ? `vstfs:///Build/Build/${config.buildId}` : '';
}

/** Where per-run scratch files live (gitignored). */
export const RESULTS_DIR = resolve(moduleDir, '..', 'results');
export const TESTCASE_MAP_PATH = resolve(moduleDir, '..', '.testcase-map.json');
export const LAST_RUN_PATH = resolve(moduleDir, '..', '.last-run.json');
