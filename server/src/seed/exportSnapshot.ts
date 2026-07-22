import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ComponentModel } from '../models/index.js';
import { connectDb, disconnectDb } from '../db.js';
import { logger } from '../lib/logger.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SNAPSHOT_DIR = join(HERE, 'snapshot');
export const COMPONENTS_SNAPSHOT = join(SNAPSHOT_DIR, 'components.json');

/**
 * Dump the entire `components` collection to a committed JSON snapshot that
 * `npm run seed` restores. Run this against a fully-populated database (the
 * live catalogue) whenever you want the seed to reflect the current parts:
 *   npm run seed:export --workspace server
 *
 * Mongo-managed fields (_id, __v, createdAt, updatedAt) are stripped so the
 * file is portable and diff-stable; docs are sorted by category+slug so the
 * committed snapshot has a deterministic order.
 */
export async function exportComponentSnapshot(): Promise<number> {
  const docs = await ComponentModel.find({}).sort({ category: 1, slug: 1 }).lean();
  for (const doc of docs as Record<string, unknown>[]) {
    delete doc._id;
    delete doc.__v;
    delete doc.createdAt;
    delete doc.updatedAt;
  }
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  writeFileSync(COMPONENTS_SNAPSHOT, `${JSON.stringify(docs, null, 2)}\n`, 'utf8');
  return docs.length;
}

/** CLI entrypoint: `npm run seed:export`. */
async function main(): Promise<void> {
  await connectDb();
  const n = await exportComponentSnapshot();
  logger.info(`Exported ${n} components → ${COMPONENTS_SNAPSHOT}`);
  await disconnectDb();
}

// Run only when invoked directly (not when imported by the seeder).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    logger.error('Snapshot export failed', err);
    process.exitCode = 1;
  });
}
