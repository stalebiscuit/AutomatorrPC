import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config, hasPat, buildUri, LAST_RUN_PATH } from './config.js';
import { getRunsByBuildUri, attachToRun } from './client.js';
import { EVIDENCE_PATH } from './build-evidence-pdf.js';

/**
 * Attach the evidence PDF to the Test Run(s) for THIS build.
 *
 * CRITICAL: filter runs by `buildUri=vstfs:///Build/Build/<id>`. The `buildIds`
 * query parameter on this endpoint is SILENTLY IGNORED by Azure DevOps and
 * returns every run in the whole project — which would spray the PDF across all
 * historical runs. And there is NO supported REST endpoint to delete a test-run
 * attachment (it returns 405), so there is no cleanup if this goes wrong. Get
 * the filter right the first time.
 */
export async function attachEvidence() {
  if (!hasPat()) {
    console.warn('[attach-evidence] No AZURE_DEVOPS_PAT — skipping.');
    return;
  }
  if (!existsSync(EVIDENCE_PATH)) {
    console.warn(`[attach-evidence] No evidence PDF at ${EVIDENCE_PATH} — nothing to attach.`);
    return;
  }
  const uri = buildUri();
  if (!uri) {
    console.warn('[attach-evidence] BUILD_BUILDID not set (not in a pipeline?) — refusing to guess runs.');
    return;
  }

  // Runs belonging to THIS build only. Includes both the reporter's run and the
  // JUnit PublishTestResults run, because both carry this build's buildUri.
  const runs = await getRunsByBuildUri(uri);
  if (!runs.length) {
    console.warn(`[attach-evidence] No Test Runs found for ${uri}.`);
    return;
  }

  const base64 = readFileSync(EVIDENCE_PATH).toString('base64');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  let lastRunName = '';
  if (existsSync(LAST_RUN_PATH)) {
    try {
      lastRunName = JSON.parse(readFileSync(LAST_RUN_PATH, 'utf8')).name ?? '';
    } catch {
      /* ignore */
    }
  }
  const fileName = `evidence_${stamp}_${(lastRunName || config.buildNumber || 'run').replace(/[^\w.-]+/g, '_')}.pdf`;

  for (const run of runs) {
    try {
      await attachToRun(run.id, fileName, base64, `Speccify evidence for build ${config.buildNumber}`);
      console.log(`[attach-evidence] Attached ${fileName} to Test Run #${run.id} (${run.name}).`);
    } catch (e) {
      console.warn(`[attach-evidence] Could not attach to run #${run.id}: ${e.message}`);
    }
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  attachEvidence()
    .then(() => process.exit(0))
    .catch((e) => {
      // Attaching evidence must not fail the deploy.
      console.warn(`[attach-evidence] ${e.message}`);
      process.exit(0);
    });
}
