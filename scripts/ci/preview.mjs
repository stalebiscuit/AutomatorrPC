#!/usr/bin/env node
/**
 * Preview-compile azure-pipelines.yml for EVERY gate mode via the Azure DevOps
 * Pipelines "preview" REST API — catches template-expression mistakes for free
 * without burning a ~30-45 min real run to discover a YAML typo.
 *
 *   AZDO_PIPELINE_ID=<id> node scripts/ci/preview.mjs
 *
 * Needs AZURE_DEVOPS_PAT (Build Read & Execute) and AZDO_PIPELINE_ID (the
 * pipeline definition id, available once the pipeline exists in ADO).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(moduleDir, '..', '..');
const { config, hasPat } = await import(`file://${ROOT}/e2e/azdo/config.js`);
const { request } = await import(`file://${ROOT}/e2e/azdo/client.js`);

const MODES = ['gate', 'gate-then-full', 'full', 'auto'];
const yaml = readFileSync(resolve(ROOT, 'azure-pipelines.yml'), 'utf8');
const pipelineId = process.env.AZDO_PIPELINE_ID;

if (!hasPat()) {
  console.error('✗ AZURE_DEVOPS_PAT not set (put it in e2e/.env).');
  process.exit(2);
}
if (!pipelineId) {
  console.error('✗ AZDO_PIPELINE_ID not set — create the pipeline in ADO first, then set its id.');
  process.exit(2);
}

let failures = 0;
for (const gateMode of MODES) {
  try {
    const res = await request(
      'POST',
      `/${encodeURIComponent(config.project)}/_apis/pipelines/${pipelineId}/preview`,
      { body: { previewRun: true, yamlOverride: yaml, templateParameters: { gateMode } } },
    );
    if (res?.finalYaml) console.log(`✓ gateMode=${gateMode} compiles`);
    else console.log(`✓ gateMode=${gateMode} accepted`);
  } catch (e) {
    failures++;
    console.error(`✗ gateMode=${gateMode} FAILED: ${e.message}`);
  }
}
process.exit(failures ? 1 : 0);
