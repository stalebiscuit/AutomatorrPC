import { existsSync, readFileSync, createWriteStream, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import PDFDocument from 'pdfkit';
import { RESULTS_DIR } from './config.js';

/**
 * Build ONE evidence PDF from the Playwright json reporter output: every test
 * with pass/fail, grouped by spec file, each UI test's screenshot embedded
 * inline. This must NEVER fail the pipeline — on any error it warns and exits 0.
 */
const JSON_PATH = resolve(RESULTS_DIR, 'e2e-results.json');
export const EVIDENCE_PATH = resolve(RESULTS_DIR, 'evidence.pdf');

/** Flatten Playwright's nested suites into { file, title, status, screenshots[] }. */
function flatten(json) {
  const rows = [];
  const walk = (suite, file) => {
    const f = suite.file || file;
    for (const spec of suite.specs ?? []) {
      const attempts = (spec.tests ?? []).flatMap((t) => t.results ?? []);
      const last = attempts[attempts.length - 1];
      const status = spec.ok ? 'passed' : last?.status ?? 'unknown';
      const screenshots = attempts
        .flatMap((r) => r.attachments ?? [])
        .filter((a) => a.contentType?.startsWith('image/') && a.path && existsSync(a.path))
        .map((a) => a.path);
      rows.push({ file: f, title: spec.title, status, screenshots });
    }
    for (const child of suite.suites ?? []) walk(child, f);
  };
  for (const s of json.suites ?? []) walk(s, s.file);
  return rows;
}

export async function buildEvidencePdf() {
  if (!existsSync(JSON_PATH)) {
    console.warn(`[evidence] No ${JSON_PATH} — skipping PDF (nothing to build from).`);
    return null;
  }
  let rows;
  try {
    rows = flatten(JSON.parse(readFileSync(JSON_PATH, 'utf8')));
  } catch (e) {
    console.warn(`[evidence] Could not parse results json: ${e.message}`);
    return null;
  }

  try {
    mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const stream = createWriteStream(EVIDENCE_PATH);
    doc.pipe(stream);

    const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const passed = rows.filter((r) => r.status === 'passed').length;
    const failed = rows.length - passed;

    doc.fontSize(20).text('Speccify E2E — Evidence', { align: 'left' });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#555').text(`Generated ${stamp} UTC`);
    doc.text(`Environment: ${process.env.E2E_ENVIRONMENT ?? 'unknown'}   Build: ${process.env.BUILD_BUILDNUMBER ?? 'local'}`);
    doc.moveDown(0.3);
    doc.fillColor(failed ? '#b00' : '#0a0').text(`${passed} passed, ${failed} failed, ${rows.length} total`);
    doc.fillColor('#000').moveDown();

    const byFile = new Map();
    for (const r of rows) {
      if (!byFile.has(r.file)) byFile.set(r.file, []);
      byFile.get(r.file).push(r);
    }

    for (const [file, specs] of byFile) {
      doc.moveDown(0.5).fontSize(13).fillColor('#003').text(file || '(unknown spec)');
      doc.fillColor('#000').fontSize(10);
      for (const s of specs) {
        const icon = s.status === 'passed' ? '✓' : s.status === 'skipped' ? '–' : '✗';
        const color = s.status === 'passed' ? '#0a0' : s.status === 'skipped' ? '#888' : '#b00';
        doc.fillColor(color).text(`  ${icon} ${s.title}  [${s.status}]`);
        doc.fillColor('#000');
        for (const shot of s.screenshots) {
          try {
            doc.moveDown(0.2).image(shot, { fit: [480, 300], align: 'center' });
            doc.moveDown(0.2);
          } catch {
            /* skip an unreadable screenshot rather than abort the whole PDF */
          }
        }
      }
    }

    doc.end();
    await new Promise((res, rej) => {
      stream.on('finish', res);
      stream.on('error', rej);
    });
    console.log(`[evidence] Wrote ${EVIDENCE_PATH} (${passed}/${rows.length} passed).`);
    return EVIDENCE_PATH;
  } catch (e) {
    console.warn(`[evidence] Failed to build PDF (continuing): ${e.message}`);
    return null;
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  // Never fail the pipeline over evidence.
  buildEvidencePdf()
    .then(() => process.exit(0))
    .catch((e) => {
      console.warn(`[evidence] ${e.message}`);
      process.exit(0);
    });
}
