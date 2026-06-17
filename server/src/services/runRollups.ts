import { connectDb, disconnectDb } from '../db.js';
import { logger } from '../lib/logger.js';
import { buildRollups } from './analytics.js';

/** Manual rollup build: `npm run rollups`. */
async function main(): Promise<void> {
  await connectDb();
  await buildRollups();
  await disconnectDb();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    logger.error('Rollups failed', err);
    process.exitCode = 1;
  });
}
