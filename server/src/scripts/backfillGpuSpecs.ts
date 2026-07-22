/**
 * Backfill die-exact GPU specs (vramType, busWidth, cudaOrStream) onto existing GPUs. The crawl is
 * additive, so GPUs imported before these tables existed are missing them. Idempotent — only fills
 * spec keys that are currently absent, so curated values are never clobbered.
 *   npm run gpu:backfill --workspace server
 */
import { connectDb, disconnectDb } from '../db.js';
import { ComponentModel } from '../models/index.js';
import { gpuDieSpecs } from '../services/catalog/crawl/decodeSpecs.js';
import { logger } from '../lib/logger.js';

async function main(): Promise<void> {
  await connectDb();
  const gpus = await ComponentModel.find({ category: 'gpu' });
  let updated = 0;
  let filled = 0;
  for (const g of gpus) {
    const die = gpuDieSpecs(g.name);
    const specs = { ...((g.specs ?? {}) as Record<string, unknown>) };
    let changed = false;
    for (const [k, v] of Object.entries(die)) {
      if (v != null && (specs[k] == null || specs[k] === '')) {
        specs[k] = v;
        changed = true;
        filled += 1;
      }
    }
    if (changed) {
      g.set('specs', specs);
      await g.save();
      updated += 1;
    }
  }
  logger.info(`GPU backfill complete — ${updated} GPUs updated, ${filled} spec fields filled.`);
  await disconnectDb();
}

main().catch((e) => {
  logger.error(e);
  process.exit(1);
});
