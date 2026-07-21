/**
 * Regenerate demo analytics events against the CURRENT catalogue.
 * Fixes a dashboard showing raw ObjectIds / bare categories when older events
 * reference components that have since been re-seeded (orphaned ids).
 *
 *   npm run reseed:events --workspace server
 */
import { fileURLToPath } from 'node:url';
import { connectDb, disconnectDb } from '../db.js';
import { ComponentModel } from '../models/index.js';
import { seedDemoEvents } from './demoEvents.js';
import { seedDemoPrices } from './demoPrices.js';
import { logger } from '../lib/logger.js';

async function main(): Promise<void> {
  await connectDb();
  await ComponentModel.init();
  const priced = await seedDemoPrices({ force: true });
  logger.info(`Seeded demo prices for ${priced} components`);
  const res = await seedDemoEvents({ force: true });
  logger.info(
    `Re-seeded analytics events — ${res.searches} searches, ${res.views} views, ${res.clicks} clicks`,
  );
  await disconnectDb();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    logger.error('reseed:events failed', err);
    process.exitCode = 1;
  });
}
