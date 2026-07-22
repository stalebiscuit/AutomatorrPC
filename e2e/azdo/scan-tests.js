import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative, join } from 'node:path';

/**
 * Static regex scan of every spec file for test titles + [AB#id] tags. Used by
 * BOTH the coverage gate and the Test Plan sync, so they can never disagree on
 * "what counts as a test". No Playwright runtime, no network — pure text scan.
 */
const moduleDir = dirname(fileURLToPath(import.meta.url));
const TESTS_ROOT = resolve(moduleDir, '..', 'tests');

// test( 'title' ) / test.only( "title" ) / test.skip( `title` ) — not describe().
const TEST_RE = /\btest(?:\.(?:only|skip|fixme))?\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
const AB_RE = /\[AB#(\d+)\]/g;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.spec\.ts$/.test(entry)) out.push(full);
  }
  return out;
}

export function scanTests() {
  const specs = walk(TESTS_ROOT);
  const tests = [];
  for (const file of specs) {
    const specFile = relative(TESTS_ROOT, file).replace(/\\/g, '/');
    const src = readFileSync(file, 'utf8');
    let m;
    TEST_RE.lastIndex = 0;
    while ((m = TEST_RE.exec(src)) !== null) {
      const title = m[2];
      const abIds = [...title.matchAll(AB_RE)].map((x) => Number(x[1]));
      tests.push({
        specFile,
        title,
        identity: `${specFile} :: ${title}`,
        abIds,
        smoke: /@smoke/.test(title),
      });
    }
  }
  return tests;
}

// CLI: print a summary (or JSON with --json).
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const tests = scanTests();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(tests, null, 2));
  } else {
    console.log(`Scanned ${tests.length} tests across specs:`);
    for (const t of tests) {
      const tags = [t.smoke ? '@smoke' : '', ...t.abIds.map((id) => `AB#${id}`)].filter(Boolean);
      console.log(`  • ${t.identity}${tags.length ? `  [${tags.join(', ')}]` : ''}`);
    }
  }
}
