/**
 * One-shot Icecat connectivity/auth diagnostic (Task 3). Node's fetch is being
 * blocked by Icecat's edge (browser works, Node "fetch failed"), so this sends
 * browser-like headers and reports whether Node gets ANY JSON back. Getting a
 * JSON body (even a "brand restrictions" error) means the edge let us through —
 * auth/product access is then a separate, solvable step. Prints NO secrets.
 * Run: npm run icecat:diagnose
 */
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../../config.js';
import { BROWSER_HEADERS } from './client.js';

const BASE = 'https://live.icecat.biz/api';
const PRODUCT_ID = '93840431';

function buildUrl(username: string): string {
  const url = new URL(BASE);
  url.searchParams.set('lang', 'EN');
  url.searchParams.set('shopname', username);
  url.searchParams.set('icecat_id', PRODUCT_ID);
  url.searchParams.set('content', 'essentialinfo');
  return url.toString();
}

async function tryVariant(name: string, url: string, headers: Record<string, string>): Promise<void> {
  try {
    const res = await fetch(url, { headers });
    const body = await res.text();
    let note: string;
    try {
      const j = JSON.parse(body) as Record<string, unknown>;
      note = `JSON ✓ (${JSON.stringify(j).slice(0, 120)})`;
    } catch {
      note = `non-JSON: ${body.replace(/\s+/g, ' ').slice(0, 100)}`;
    }
    console.log(`[${String(res.status).padEnd(3)}] ${name.padEnd(28)} ${note}`);
  } catch (err) {
    console.log(`[ERR] ${name.padEnd(28)} ${(err as Error).message}`);
  }
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const username = cfg.ICECAT_USERNAME;
  const token = cfg.ICECAT_API_TOKEN;
  if (!username || !token) {
    console.log('ICECAT_USERNAME / ICECAT_API_TOKEN missing from server/.env');
    process.exitCode = 2;
    return;
  }
  const url = buildUrl(username);
  const basic = 'Basic ' + Buffer.from(`${username}:${token}`).toString('base64');
  const B = BROWSER_HEADERS;

  console.log('Icecat diagnostic with browser-like headers (secrets not printed)\n');
  await tryVariant('browser + api-token', url, { ...B, 'api-token': token });
  await tryVariant('browser, no token', url, { ...B });
  await tryVariant('browser + basic auth', url, { ...B, authorization: basic });
  await tryVariant('browser + api_token (underscore)', url, { ...B, api_token: token });
  console.log('\nAny line with "JSON ✓" means Node got through the edge. If all are [ERR] fetch failed,');
  console.log('the edge is fingerprint-blocking Node (headers alone may not fix it) — then we pivot to the bulk data channel.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error('diagnostic failed:', err);
    process.exitCode = 1;
  });
}
