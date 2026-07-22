import { fileURLToPath } from 'node:url';
import { config, hasPat } from './config.js';
import { wiql, getWorkItems } from './client.js';
import { scanTests } from './scan-tests.js';

/**
 * Coverage gate: every OPEN board ticket (a Task not in a closed state) must be
 * covered by at least one test tagged [AB#<id>], or the deploy is blocked.
 *
 * Escape hatches (both logged loudly so they're never left on by accident):
 *   • a ticket tagged "no-test"          — legitimately un-testable work.
 *   • pipeline var AZDO_GATE_SKIP=true    — genuine emergency override.
 */
export async function coverageGate() {
  if (config.gateSkip) {
    console.warn(
      '\n⚠️  ⚠️  AZDO_GATE_SKIP=true — COVERAGE GATE BYPASSED. This must only be used in a genuine\n' +
        '        emergency and turned OFF immediately afterwards. Deploy is NOT blocked by coverage.\n',
    );
    return { ok: true, skipped: true };
  }
  if (!hasPat()) {
    console.warn('[coverage-gate] No AZURE_DEVOPS_PAT configured — skipping gate (not a hard failure).');
    return { ok: true, skipped: true };
  }

  const closedList = config.closedStates.map((s) => `'${s}'`).join(', ');
  const query =
    `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project ` +
    `AND [System.WorkItemType] = '${config.ticketWorkItemType}' ` +
    `AND [System.State] NOT IN (${closedList})`;
  const refs = await wiql(query);
  const ids = refs.map((r) => r.id);
  if (!ids.length) {
    console.log('[coverage-gate] No open tickets — gate passes.');
    return { ok: true, uncovered: [] };
  }

  const items = await getWorkItems(ids, ['System.Id', 'System.Title', 'System.Tags']);
  const tests = scanTests();
  const coveredIds = new Set(tests.flatMap((t) => t.abIds));

  const uncovered = [];
  for (const wi of items) {
    const id = wi.id ?? wi.fields?.['System.Id'];
    const title = wi.fields?.['System.Title'] ?? '(untitled)';
    const tags = String(wi.fields?.['System.Tags'] ?? '')
      .split(';')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (tags.includes(config.noTestTag)) {
      console.log(`[coverage-gate] AB#${id} "${title}" — exempt (tagged "${config.noTestTag}").`);
      continue;
    }
    if (coveredIds.has(id)) {
      console.log(`[coverage-gate] AB#${id} "${title}" — covered.`);
      continue;
    }
    uncovered.push({ id, title });
  }

  if (uncovered.length) {
    console.error('\n❌ Coverage gate FAILED — these open tickets have no [AB#id]-tagged test:');
    for (const u of uncovered) console.error(`   • AB#${u.id}  ${u.title}`);
    console.error(
      `\nAdd a test whose title contains [AB#${uncovered[0].id}], tag the ticket "${config.noTestTag}",\n` +
        'or (emergency only) set AZDO_GATE_SKIP=true.\n',
    );
    return { ok: false, uncovered };
  }
  console.log(`[coverage-gate] All ${items.length} open ticket(s) covered — gate passes.`);
  return { ok: true, uncovered: [] };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  coverageGate()
    .then((r) => process.exit(r.ok ? 0 : 1))
    .catch((err) => {
      console.error('[coverage-gate] Error:', err.message);
      // A gate error (e.g. bad PAT) should block deploy — fail closed in CI.
      process.exit(1);
    });
}
