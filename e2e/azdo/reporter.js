import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';
import { config, hasPat, TESTCASE_MAP_PATH, LAST_RUN_PATH } from './config.js';
import { createRun, addResults, updateRun } from './client.js';
import { runContext } from './run-context.js';
import { scanTests } from './scan-tests.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const TESTS_ROOT = resolve(moduleDir, '..', 'tests');

function outcomeFor(status) {
  if (status === 'passed') return 'Passed';
  if (status === 'skipped') return 'NotExecuted';
  return 'Failed'; // failed | timedOut | interrupted
}

/**
 * Playwright reporter → Azure DevOps Test Run. Publishes EVERY run that produces
 * results (local or CI); no-ops cleanly when no PAT is set. Hard-won rules:
 *   • Never guess "is this the full suite" to decide whether to publish — you
 *     can't tell a full run from a filtered subset inside a reporter. Publish
 *     every run and TAG partial ones in the title ("(2/40 tests)").
 *   • Pass plan.id at creation but NOT pointIds — pointIds pre-seeds one empty
 *     result per point and doubles your totals (40/40 shows as 40/80). Results
 *     carry the Test Case reference instead.
 *   • Retries fire onTestEnd once per attempt — dedupe to the FINAL attempt so a
 *     flaky-then-passed test doesn't leave a stray "Failed" result.
 *   • Persist the run id/name to .last-run.json so a later pipeline step (the
 *     evidence-PDF attach, after Playwright exits) can find this exact run.
 */
export default class AzureDevOpsReporter {
  constructor() {
    this._byTest = new Map(); // test.id -> { result, test } (final attempt wins)
    this._enabled = hasPat();
    this._map = { testCases: {}, planId: null };
    if (existsSync(TESTCASE_MAP_PATH)) {
      try {
        this._map = JSON.parse(readFileSync(TESTCASE_MAP_PATH, 'utf8'));
      } catch {
        /* no map yet — results post with titles only */
      }
    }
  }

  onBegin(_config, suite) {
    this._selectedCount = suite.allTests().length;
  }

  onTestEnd(test, result) {
    if (!this._enabled) return;
    const prev = this._byTest.get(test.id);
    // Keep the highest retry index = the final attempt.
    if (!prev || result.retry >= prev.result.retry) this._byTest.set(test.id, { result, test });
  }

  async onEnd(runResult) {
    if (!this._enabled) {
      console.log('[azdo-reporter] No AZURE_DEVOPS_PAT — skipping Test Run publish.');
      return;
    }
    try {
      const ctx = runContext();
      const universe = scanTests().length || this._byTest.size;
      const ran = this._byTest.size;
      const partial = ran < universe;
      const name =
        `Speccify E2E — ${ctx.environment}/${ctx.reason} @ ${ctx.commit || 'local'} ` +
        `[${ctx.gateMode}] — ${ran}/${universe} tests${partial ? ' (partial)' : ''}`;

      const runBody = {
        name,
        automated: true,
        comment: `status=${runResult.status}; branch=${ctx.branch}; actor=${ctx.actor}`,
        ...(this._map.planId ? { plan: { id: this._map.planId } } : {}),
        ...(config.buildId ? { build: { id: config.buildId } } : {}),
        // Deliberately NO pointIds here (see class docstring).
      };
      const run = await createRun(runBody);
      const runId = run.id;

      const results = [...this._byTest.values()].map(({ result, test }) => {
        const specFile = relative(TESTS_ROOT, test.location.file).replace(/\\/g, '/');
        const identity = `${specFile} :: ${test.title}`;
        const tcId = this._map.testCases?.[identity];
        const errorMessage = result.errors?.map((e) => e.message).join('\n').slice(0, 1000);
        return {
          testCaseTitle: identity,
          automatedTestName: identity,
          automatedTestStorage: specFile,
          outcome: outcomeFor(result.status),
          state: 'Completed',
          durationInMs: Math.round(result.duration) || 0,
          ...(tcId ? { testCase: { id: tcId } } : {}),
          ...(errorMessage ? { errorMessage } : {}),
        };
      });

      if (results.length) await addResults(runId, results);
      await updateRun(runId, { state: 'Completed' });

      writeFileSync(
        LAST_RUN_PATH,
        JSON.stringify({ runId, name, buildId: config.buildId, ran, universe, partial }, null, 2),
      );
      console.log(`[azdo-reporter] Published Test Run #${runId} — ${name}`);
    } catch (err) {
      // A reporting failure must NEVER fail the test run itself.
      console.warn(`[azdo-reporter] Failed to publish Test Run: ${err.message}`);
    }
  }
}
