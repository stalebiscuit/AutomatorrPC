import { config } from './config.js';

/**
 * Thin Azure DevOps REST client (native fetch, Node 20+).
 *
 * CRITICAL: Azure DevOps answers an invalid/expired PAT with HTTP 200 and an
 * HTML sign-in page — NOT a 401. If we blindly JSON.parse that, the failure
 * resurfaces later as a baffling "Cannot read properties of null". So we detect
 * a 2xx whose body isn't JSON (or is HTML) and raise a clear, actionable error.
 */
export class AzdoError extends Error {}

function authHeader() {
  // PAT auth = Basic base64(":" + pat).
  return `Basic ${Buffer.from(`:${config.pat}`).toString('base64')}`;
}

function looksLikeSignInHtml(text, contentType) {
  const ct = (contentType ?? '').toLowerCase();
  if (ct.includes('text/html')) return true;
  const head = text.slice(0, 200).trimStart().toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html') || head.includes('sign in');
}

/**
 * @param {string} method
 * @param {string} path  absolute URL, or a path appended to orgUrl
 * @param {{ body?: any, query?: Record<string,string|number|undefined>, contentType?: string, apiVersion?: string, project?: boolean }} [opts]
 */
export async function request(method, path, opts = {}) {
  if (!config.pat) throw new AzdoError('AZURE_DEVOPS_PAT is not set.');

  let url = path.startsWith('http') ? path : `${config.orgUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  const query = { 'api-version': opts.apiVersion ?? config.apiVersion, ...(opts.query ?? {}) };
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  if (qs) url += (url.includes('?') ? '&' : '?') + qs;

  const headers = { Authorization: authHeader(), Accept: 'application/json' };
  let payload;
  if (opts.body !== undefined) {
    headers['Content-Type'] = opts.contentType ?? 'application/json';
    payload = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  }

  const res = await fetch(url, { method, headers, body: payload });
  const text = await res.text();
  const contentType = res.headers.get('content-type');

  // The invalid-PAT trap: a 2xx that isn't JSON is the HTML sign-in page.
  if (res.ok && looksLikeSignInHtml(text, contentType)) {
    throw new AzdoError(
      'AZURE_DEVOPS_PAT is invalid or expired (Azure DevOps returned an HTML sign-in page with HTTP ' +
        `${res.status}). Regenerate the PAT and update BOTH e2e/.env and the pipeline's AZURE_DEVOPS_PAT variable.`,
    );
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 203) {
      throw new AzdoError(`AZURE_DEVOPS_PAT rejected (HTTP ${res.status}). Check scopes/expiry.`);
    }
    throw new AzdoError(`Azure DevOps ${method} ${path} → HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new AzdoError(
      `Azure DevOps ${method} ${path} returned 2xx but non-JSON body (likely an auth problem): ${text.slice(0, 200)}`,
    );
  }
}

const proj = () => `/${encodeURIComponent(config.project)}`;

// ── Work items ───────────────────────────────────────────────────────
export async function wiql(query) {
  const r = await request('POST', `${proj()}/_apis/wit/wiql`, { body: { query } });
  return r?.workItems ?? [];
}

export async function getWorkItems(ids, fields) {
  if (!ids.length) return [];
  const r = await request('GET', `/_apis/wit/workitems`, {
    query: { ids: ids.join(','), fields: fields?.join(','), 'api-version': config.apiVersion },
  });
  return r?.value ?? [];
}

export async function createTestCaseWorkItem(title) {
  // Test Cases are work items of type "Test Case"; created via JSON-Patch.
  return request('POST', `${proj()}/_apis/wit/workitems/$Test%20Case`, {
    contentType: 'application/json-patch+json',
    body: [{ op: 'add', path: '/fields/System.Title', value: title }],
  });
}

export async function linkTestToWorkItem(testCaseId, workItemId) {
  // Tested-By link: from the work item to the test case (Microsoft.VSTS.Common.TestedBy-Forward).
  return request('PATCH', `${proj()}/_apis/wit/workitems/${workItemId}`, {
    contentType: 'application/json-patch+json',
    body: [
      {
        op: 'add',
        path: '/relations/-',
        value: {
          rel: 'Microsoft.VSTS.Common.TestedBy-Forward',
          url: `${config.orgUrl}${proj()}/_apis/wit/workItems/${testCaseId}`,
        },
      },
    ],
  });
}

// ── Test plans / suites ──────────────────────────────────────────────
export async function listPlans() {
  const r = await request('GET', `${proj()}/_apis/testplan/plans`);
  return r?.value ?? [];
}
export async function createPlan(name) {
  return request('POST', `${proj()}/_apis/testplan/plans`, { body: { name } });
}
export async function getPlan(planId) {
  return request('GET', `${proj()}/_apis/testplan/plans/${planId}`);
}
export async function listSuites(planId) {
  const r = await request('GET', `${proj()}/_apis/testplan/Plans/${planId}/suites`, {
    query: { asTreeView: 'false' },
  });
  return r?.value ?? [];
}
export async function createStaticSuite(planId, parentSuiteId, name) {
  return request('POST', `${proj()}/_apis/testplan/Plans/${planId}/suites`, {
    body: { name, suiteType: 'staticTestSuite', parentSuite: { id: parentSuiteId } },
  });
}
export async function createRequirementSuite(planId, parentSuiteId, workItemId) {
  return request('POST', `${proj()}/_apis/testplan/Plans/${planId}/suites`, {
    body: {
      suiteType: 'requirementTestSuite',
      parentSuite: { id: parentSuiteId },
      requirementId: workItemId,
    },
  });
}
export async function addTestCasesToSuite(planId, suiteId, testCaseIds) {
  if (!testCaseIds.length) return null;
  const body = testCaseIds.map((id) => ({ workItem: { id } }));
  return request('POST', `${proj()}/_apis/testplan/Plans/${planId}/Suites/${suiteId}/TestCase`, {
    body,
  });
}
export async function listSuiteTestCases(planId, suiteId) {
  const r = await request('GET', `${proj()}/_apis/testplan/Plans/${planId}/Suites/${suiteId}/TestCase`);
  return r?.value ?? [];
}

// ── Test runs / results / attachments ────────────────────────────────
export async function createRun(body) {
  return request('POST', `${proj()}/_apis/test/runs`, { body });
}
export async function addResults(runId, results) {
  return request('POST', `${proj()}/_apis/test/runs/${runId}/results`, { body: results });
}
export async function updateRun(runId, body) {
  return request('PATCH', `${proj()}/_apis/test/runs/${runId}`, { body });
}
export async function getRunsByBuildUri(uri) {
  // IMPORTANT: filter by buildUri. The buildIds parameter is SILENTLY IGNORED
  // by Azure DevOps and returns every run in the project (see attach-evidence).
  const r = await request('GET', `${proj()}/_apis/test/runs`, { query: { buildUri: uri } });
  return r?.value ?? [];
}
export async function attachToRun(runId, fileName, base64Stream, comment) {
  return request('POST', `${proj()}/_apis/test/runs/${runId}/attachments`, {
    body: {
      attachmentType: 'GeneralAttachment',
      fileName,
      comment: comment ?? '',
      stream: base64Stream,
    },
  });
}
