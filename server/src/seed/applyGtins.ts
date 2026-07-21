/**
 * DB-2 apply step: read a filled GTIN CSV and write validated GTINs into the
 * seed data (and optionally the live DB). Every code is checksum-validated
 * (isValidGtin) so a malformed/fabricated barcode can never enter the catalogue.
 *
 *   CSV columns (header required): category,slug,gtin   (extra columns ignored)
 *   Usage:  npm run gtins:apply --workspace server -- docs/gtin-worklist.csv
 *           npm run gtins:apply --workspace server -- <file.csv> --db   (also update Mongo)
 *
 * Idempotent: re-running with the same CSV is a no-op.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isValidGtin, normalizeGtin, gtinError, BUILDER_CATEGORIES } from '@automatorr/shared';
import { logger } from '../lib/logger.js';

const SEED_DIR = path.resolve(fileURLToPath(new URL('./data', import.meta.url)));

interface Row {
  category: string;
  slug: string;
  gtin: string;
}

/** Minimal CSV parse (handles quoted fields, commas, CRLF). Header row required. */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  const split = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const header = split(lines[0]!).map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cells = split(l);
    const rec: Record<string, string> = {};
    header.forEach((h, i) => (rec[h] = (cells[i] ?? '').trim()));
    return rec;
  });
}

export interface ApplyResult {
  applied: number;
  skippedEmpty: number;
  invalid: { slug: string; gtin: string; reason: string }[];
  unmatched: { category: string; slug: string }[];
}

/** Apply the CSV rows to the seed JSON files. Returns a report. */
export function applyGtinsToSeed(csvPath: string): ApplyResult {
  const rows = parseCsv(readFileSync(csvPath, 'utf8'))
    .map((r): Row => ({ category: r.category ?? '', slug: r.slug ?? '', gtin: r.gtin ?? '' }))
    .filter((r) => r.category && r.slug);

  const result: ApplyResult = { applied: 0, skippedEmpty: 0, invalid: [], unmatched: [] };
  const byCat = new Map<string, Row[]>();
  for (const r of rows) {
    if (!(BUILDER_CATEGORIES as readonly string[]).includes(r.category)) continue;
    (byCat.get(r.category) ?? byCat.set(r.category, []).get(r.category)!).push(r);
  }

  for (const [category, catRows] of byCat) {
    const file = path.join(SEED_DIR, `${category}.json`);
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    const items: { slug: string; gtin?: string | null }[] = Array.isArray(raw) ? raw : raw.components;
    const bySlug = new Map(items.map((c) => [c.slug, c]));
    let changed = false;

    for (const r of catRows) {
      const gtin = normalizeGtin(r.gtin);
      if (gtin === '') { result.skippedEmpty += 1; continue; }
      if (!isValidGtin(gtin)) {
        result.invalid.push({ slug: r.slug, gtin: r.gtin, reason: gtinError(gtin) ?? 'invalid' });
        continue;
      }
      const comp = bySlug.get(r.slug);
      if (!comp) { result.unmatched.push({ category, slug: r.slug }); continue; }
      if (comp.gtin !== gtin) { comp.gtin = gtin; changed = true; }
      result.applied += 1;
    }
    if (changed) writeFileSync(file, JSON.stringify(raw, null, 2) + '\n');
  }
  return result;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const csvPath = args.find((a) => !a.startsWith('--'));
  if (!csvPath) throw new Error('Usage: gtins:apply <file.csv> [--db]');

  const r = applyGtinsToSeed(csvPath);
  logger.info(
    `GTINs applied to seed: ${r.applied} · empty ${r.skippedEmpty} · invalid ${r.invalid.length} · unmatched ${r.unmatched.length}`,
  );
  for (const bad of r.invalid) logger.warn(`  invalid GTIN "${bad.gtin}" for ${bad.slug} — ${bad.reason}`);
  for (const um of r.unmatched) logger.warn(`  no seed component "${um.slug}" in ${um.category}`);

  if (args.includes('--db')) {
    const { connectDb, disconnectDb } = await import('../db.js');
    const { ComponentModel } = await import('../models/index.js');
    await connectDb();
    let dbUpdated = 0;
    for (const row of parseCsv(readFileSync(csvPath, 'utf8'))) {
      const gtin = normalizeGtin(row.gtin ?? '');
      if (!isValidGtin(gtin) || !row.slug) continue;
      const res = await ComponentModel.updateOne({ category: row.category, slug: row.slug }, { $set: { gtin } });
      if (res.modifiedCount) dbUpdated += 1;
    }
    logger.info(`GTINs applied to DB: ${dbUpdated}`);
    await disconnectDb();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    logger.error('gtins:apply failed', err);
    process.exitCode = 1;
  });
}
