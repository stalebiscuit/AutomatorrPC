import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config, hasPat, TESTCASE_MAP_PATH } from './config.js';
import {
  listPlans,
  createPlan,
  getPlan,
  listSuites,
  createStaticSuite,
  createRequirementSuite,
  addTestCasesToSuite,
  createTestCaseWorkItem,
  linkTestToWorkItem,
  wiql,
} from './client.js';
import { scanTests } from './scan-tests.js';

/**
 * Create/maintain the Test Plan structure:
 *   - one Plan (config.planName),
 *   - one static suite per spec file, one Test Case per test titled
 *     "<spec-file> :: <test title>",
 *   - a Tests/Tested-By link for any [AB#id] in a title,
 *   - one requirement-based suite per OPEN board ticket, so a new ticket
 *     automatically appears in the plan.
 *
 * Writes .testcase-map.json (gitignored) so the reporter can attach results to
 * the right Test Case. Idempotent and re-runnable.
 */
function loadMap() {
  if (existsSync(TESTCASE_MAP_PATH)) {
    try {
      return JSON.parse(readFileSync(TESTCASE_MAP_PATH, 'utf8'));
    } catch {
      /* corrupt scratch file — rebuild it */
    }
  }
  return { planId: null, testCases: {} };
}
function saveMap(map) {
  writeFileSync(TESTCASE_MAP_PATH, JSON.stringify(map, null, 2));
}

async function ensurePlan() {
  const plans = await listPlans();
  const found = plans.find((p) => p.name === config.planName);
  const plan = found ? await getPlan(found.id) : await createPlan(config.planName);
  const rootSuiteId = plan.rootSuite?.id ?? plan.rootSuiteId;
  if (!rootSuiteId) throw new Error('Could not resolve the plan root suite id.');
  return { planId: plan.id, rootSuiteId };
}

export async function syncTestPlan() {
  if (!hasPat()) {
    console.warn('[sync-test-plan] No AZURE_DEVOPS_PAT — skipping (no-op).');
    return { skipped: true };
  }

  const map = loadMap();
  const { planId, rootSuiteId } = await ensurePlan();
  map.planId = planId;

  const suites = await listSuites(planId);
  const staticByName = new Map(
    suites.filter((s) => s.suiteType === 'staticTestSuite').map((s) => [s.name, s.id]),
  );

  const tests = scanTests();
  const bySpec = new Map();
  for (const t of tests) {
    if (!bySpec.has(t.specFile)) bySpec.set(t.specFile, []);
    bySpec.get(t.specFile).push(t);
  }

  // Static suite + Test Case per test.
  for (const [specFile, specTests] of bySpec) {
    let suiteId = staticByName.get(specFile);
    if (!suiteId) {
      const suite = await createStaticSuite(planId, rootSuiteId, specFile);
      suiteId = suite.id;
      staticByName.set(specFile, suiteId);
      console.log(`[sync-test-plan] created suite "${specFile}" (#${suiteId})`);
    }
    for (const t of specTests) {
      let tcId = map.testCases[t.identity];
      if (!tcId) {
        const wi = await createTestCaseWorkItem(t.identity);
        tcId = wi.id;
        map.testCases[t.identity] = tcId;
        console.log(`[sync-test-plan] created Test Case #${tcId} — ${t.identity}`);
      }
      try {
        await addTestCasesToSuite(planId, suiteId, [tcId]);
      } catch (e) {
        // Already-in-suite is fine; anything else is worth surfacing.
        if (!/already|exist/i.test(e.message)) console.warn(`[sync-test-plan] add-to-suite: ${e.message}`);
      }
      for (const abId of t.abIds) {
        try {
          await linkTestToWorkItem(tcId, abId);
        } catch (e) {
          if (!/already|exist|relation/i.test(e.message))
            console.warn(`[sync-test-plan] link AB#${abId}: ${e.message}`);
        }
      }
    }
  }

  // Requirement-based suite per open board ticket.
  const closedList = config.closedStates.map((s) => `'${s}'`).join(', ');
  const openRefs = await wiql(
    `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project ` +
      `AND [System.WorkItemType] = '${config.ticketWorkItemType}' ` +
      `AND [System.State] NOT IN (${closedList})`,
  );
  const existingReqIds = new Set(
    suites.filter((s) => s.suiteType === 'requirementTestSuite').map((s) => Number(s.requirementId)),
  );
  for (const ref of openRefs) {
    if (existingReqIds.has(ref.id)) continue;
    try {
      await createRequirementSuite(planId, rootSuiteId, ref.id);
      console.log(`[sync-test-plan] created requirement suite for AB#${ref.id}`);
    } catch (e) {
      console.warn(`[sync-test-plan] requirement suite AB#${ref.id}: ${e.message}`);
    }
  }

  saveMap(map);
  console.log(
    `[sync-test-plan] done — plan #${planId}, ${Object.keys(map.testCases).length} test case(s) mapped.`,
  );
  return { planId, testCaseCount: Object.keys(map.testCases).length };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  syncTestPlan().catch((err) => {
    console.error('[sync-test-plan] Error:', err.message);
    process.exit(1);
  });
}
