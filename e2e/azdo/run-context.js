import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

/**
 * Resolve "why is this running" for the Test Run title/comment: local-dev /
 * feature / bugfix / promotion / ci — inferred from the branch when not set
 * explicitly — plus environment, branch, commit and actor.
 */
function git(cmd, fallback = '') {
  try {
    return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return fallback;
  }
}

function branchName() {
  // In Azure Pipelines, BUILD_SOURCEBRANCH looks like refs/heads/main.
  const raw = process.env.BUILD_SOURCEBRANCH ?? '';
  if (raw) return raw.replace(/^refs\/heads\//, '');
  return git('rev-parse --abbrev-ref HEAD', 'unknown');
}

function inferReason(branch, isCi) {
  if (process.env.AZDO_RUN_REASON) return process.env.AZDO_RUN_REASON;
  if (branch === 'main' || branch === 'test') return 'promotion';
  if (/^(feature|feat)\//.test(branch)) return 'feature';
  if (/^(bugfix|fix|hotfix)\//.test(branch)) return 'bugfix';
  if (isCi) return 'ci';
  return 'local-dev';
}

export function runContext() {
  const isCi = config.isCi;
  const branch = branchName();
  const environment =
    process.env.E2E_ENVIRONMENT ?? (branch === 'main' ? 'prod' : branch === 'test' ? 'test' : 'dev');
  const commit = (process.env.BUILD_SOURCEVERSION ?? git('rev-parse HEAD', '')).slice(0, 10);
  const actor =
    process.env.BUILD_REQUESTEDFOR ?? process.env.BUILD_QUEUEDBY ?? git('config user.name', 'local');

  return {
    reason: inferReason(branch, isCi),
    environment,
    branch,
    commit,
    actor,
    isCi,
    gateMode: process.env.GATE_MODE ?? process.env.gateMode ?? 'auto',
  };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify(runContext(), null, 2));
}
