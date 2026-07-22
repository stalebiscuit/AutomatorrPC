#!/usr/bin/env node
/**
 * Interactive push/promote → Azure DevOps pipeline trigger.
 *
 *   npm run push:dev      current branch → dev   (tests + Test Run, NO deploy)
 *   npm run promote:test  remote dev    → test   (deploy to Test on a passing gate)
 *   npm run promote:prod  remote test   → main   (deploy to Prod on a passing gate)
 *
 * Each run PROMPTS for a gate mode and an optional note, pushes/promotes the
 * branch, then triggers the pipeline via the REST API with gateMode as a runtime
 * template parameter. The pipeline itself is `trigger: none`, so a bare `git
 * push` never starts CI — only this explicit REST call does. That's deliberate:
 * push-triggers + any duplicate pipeline definition would double every run.
 *
 * Non-interactive use (CI/tests): pass --gate=<mode> --note="..." --yes, or set
 * TRIGGER_GATE / TRIGGER_NOTE / TRIGGER_YES. --dry-run does everything except
 * the git push and the REST trigger.
 */
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const AZDO_DIR = resolve(moduleDir, '..', '..', 'e2e', 'azdo');
const { config, hasPat } = await import(`file://${AZDO_DIR}/config.js`);
const { request } = await import(`file://${AZDO_DIR}/client.js`);

const GATE_MODES = ['gate', 'gate-then-full', 'full'];
const MODES = {
  'push-dev': { target: 'dev', source: 'HEAD', defaultGate: 'gate-then-full', deploy: 'none' },
  'promote-test': { target: 'test', source: 'dev', defaultGate: 'gate-then-full', deploy: 'Test' },
  'promote-prod': { target: 'main', source: 'test', defaultGate: 'full', deploy: 'Prod' },
};

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : undefined;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);
const remote = process.env.AZURE_REMOTE ?? 'azure';
const dryRun = hasFlag('dry-run');

function git(cmd) {
  return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
}

async function main() {
  const modeName = process.argv[2];
  const mode = MODES[modeName];
  if (!mode) {
    console.error(`Usage: trigger.mjs <push-dev|promote-test|promote-prod> [--gate=..] [--note=..] [--yes] [--dry-run]`);
    process.exit(2);
  }

  const interactive = stdin.isTTY && !hasFlag('yes') && !process.env.TRIGGER_YES;
  let gate = arg('gate') ?? process.env.TRIGGER_GATE ?? mode.defaultGate;
  let note = arg('note') ?? process.env.TRIGGER_NOTE ?? '';

  if (interactive) {
    const rl = createInterface({ input: stdin, output: stdout });
    try {
      const g = (
        await rl.question(`Gate mode [${GATE_MODES.join(' / ')}] (default: ${mode.defaultGate}): `)
      ).trim();
      if (g) gate = g;
      note = (await rl.question('Optional note (blank to skip): ')).trim() || note;
    } finally {
      rl.close();
    }
  }

  if (!GATE_MODES.includes(gate)) {
    console.error(`Invalid gate mode "${gate}". Must be one of: ${GATE_MODES.join(', ')}`);
    process.exit(2);
  }

  const currentBranch = git('rev-parse --abbrev-ref HEAD');
  const sourceDesc = mode.source === 'HEAD' ? `${currentBranch} (HEAD)` : `${remote}/${mode.source}`;
  console.log(`\n  Action:   ${modeName}`);
  console.log(`  Promote:  ${sourceDesc}  →  ${mode.target}`);
  console.log(`  Gate:     ${gate}`);
  console.log(`  Deploy:   ${mode.deploy === 'none' ? 'none (records a Test Run only)' : mode.deploy}`);
  if (note) console.log(`  Note:     ${note}`);
  console.log(`  Remote:   ${remote}${dryRun ? '   [DRY RUN]' : ''}\n`);

  if (interactive) {
    const rl = createInterface({ input: stdin, output: stdout });
    const ok = (await rl.question('Proceed? [y/N]: ')).trim().toLowerCase();
    rl.close();
    if (ok !== 'y' && ok !== 'yes') {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  // 1) Push / promote the branch on the remote (does NOT trigger CI — trigger:none).
  const refspec = mode.source === 'HEAD' ? `HEAD:refs/heads/${mode.target}` : `${remote}/${mode.source}:refs/heads/${mode.target}`;
  if (mode.source !== 'HEAD') {
    console.log(`→ git fetch ${remote}`);
    if (!dryRun) git(`fetch ${remote}`);
  }
  console.log(`→ git push ${remote} ${refspec}`);
  if (!dryRun) {
    try {
      console.log(git(`push ${remote} ${refspec}`));
    } catch (e) {
      console.error(
        `\n✗ Push failed. If this is a non-fast-forward promotion, reconcile the branches first ` +
          `(the promote flow expects ${mode.target} to be a fast-forward of ${sourceDesc}).\n${e.message}`,
      );
      process.exit(1);
    }
  }

  // 2) Trigger the pipeline via REST with gateMode as a template parameter.
  const pipelineId = process.env.AZDO_PIPELINE_ID ?? arg('pipeline-id');
  if (!hasPat()) {
    console.warn('\n⚠️  No AZURE_DEVOPS_PAT — branch pushed, but cannot trigger CI via REST.');
    console.warn('    Run the pipeline manually in Azure DevOps, or set the PAT and re-run.');
    return;
  }
  if (!pipelineId) {
    console.warn('\n⚠️  AZDO_PIPELINE_ID not set — branch pushed, but cannot trigger CI.');
    console.warn('    Set AZDO_PIPELINE_ID in e2e/.env (the pipeline definition id) and re-run.');
    return;
  }

  const body = {
    resources: { repositories: { self: { refName: `refs/heads/${mode.target}` } } },
    templateParameters: { gateMode: gate },
  };
  if (note) body.variables = { triggerNote: { value: note, isSecret: false } };

  if (dryRun) {
    console.log(`\n[DRY RUN] would POST pipelines/${pipelineId}/runs with`, JSON.stringify(body));
    return;
  }
  const run = await request('POST', `/${encodeURIComponent(config.project)}/_apis/pipelines/${pipelineId}/runs`, {
    body,
  });
  const url = run?._links?.web?.href ?? `${config.orgUrl}/${config.project}/_build/results?buildId=${run?.id}`;
  console.log(`\n✓ Pipeline run #${run?.id ?? '?'} queued on ${mode.target} (gate=${gate}).`);
  console.log(`  ${url}\n`);
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
