/**
 * DB-5 apply step: give benchmarked parts (gpu/ram/storage) a performanceIndex
 * derived from their real specs. Icecat enrichment leaves performanceIndex 0
 * (it has no benchmark data); this fills it so those parts score + compare.
 *
 *   npm run index:benchmarked --workspace server           # only parts with index 0
 *   npm run index:benchmarked --workspace server -- --all  # recompute every part
 *
 * Parts whose specs don't yield a score fall back to the category median so
 * nothing is left unscored.
 */
import { fileURLToPath } from 'node:url';
import { connectDb, disconnectDb } from '../db.js';
import { ComponentModel } from '../models/index.js';
import { normaliseIndex } from '../services/scoring.js';
import { benchmarkUbRaw } from '../services/catalog/benchmarkIndex.js';
import { logger } from '../lib/logger.js';
import type { Category } from '@automatorr/shared';

const CATS: Category[] = ['gpu', 'ram', 'storage'];

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

async function main(): Promise<void> {
  const all = process.argv.includes('--all');
  await connectDb();
  await ComponentModel.init();

  let totalUpdated = 0;
  for (const category of CATS) {
    const docs = await ComponentModel.find({ category });
    // First pass: derive raw scores; collect known ones for the median fallback.
    const raws = new Map<string, number | null>();
    for (const d of docs) raws.set(String(d._id), benchmarkUbRaw(category, d.specs as never));
    const known = [...raws.values()].filter((v): v is number => v !== null && v > 0);
    const fallback = median(known) || 1;

    let updated = 0;
    const samples: string[] = [];
    for (const d of docs) {
      if (!all && (d.performanceIndex ?? 0) !== 0) continue; // only fill the empties
      const ubRaw = raws.get(String(d._id)) ?? fallback;
      const finalRaw = ubRaw && ubRaw > 0 ? ubRaw : fallback;
      const index = normaliseIndex(category, finalRaw);
      await ComponentModel.updateOne(
        { _id: d._id },
        { $set: { performanceIndex: index, 'benchmark.ubRaw': finalRaw, 'benchmark.ubSource': 'db5:derived' } },
      );
      updated += 1;
      if (samples.length < 4) samples.push(`${d.name} → ${index}`);
    }
    totalUpdated += updated;
    logger.info(`[index:${category}] updated ${updated}/${docs.length} (median raw ${fallback})`);
    for (const s of samples) logger.info(`    ${s}`);
  }

  logger.info(`DB-5 complete — performanceIndex set on ${totalUpdated} benchmarked parts`);
  await disconnectDb();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    logger.error('index:benchmarked failed', err);
    process.exitCode = 1;
  });
}
