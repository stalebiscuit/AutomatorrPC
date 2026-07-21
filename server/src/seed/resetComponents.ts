/**
 * CLI: `npm run db:reset` — clear the components collection via the app's own
 * Mongo connection (no external mongosh needed). Use before re-seeding to remove
 * stale docs (seeding is upsert-only and won't delete renamed/removed slugs).
 */
import { fileURLToPath } from 'node:url';
import { connectDb, disconnectDb } from '../db.js';
import { ComponentModel } from '../models/index.js';
import { logger } from '../lib/logger.js';

async function main(): Promise<void> {
  await connectDb();
  const res = await ComponentModel.deleteMany({});
  logger.info(`Cleared components collection — removed ${res.deletedCount} docs`);
  await disconnectDb();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    logger.error('db:reset failed', err);
    process.exitCode = 1;
  });
}
