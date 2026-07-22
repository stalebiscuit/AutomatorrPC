import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb } from './db.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { ComponentModel, AffiliateLinkModel } from './models/index.js';
import { seedDatabase } from './seed/seed.js';
import { seedDemoEvents } from './seed/demoEvents.js';
import { seedDemoPrices } from './seed/demoPrices.js';
import { loadAffiliateConfigs } from './services/affiliate/affiliateService.js';
import { seedSuperadmins } from './services/auth/bootstrap.js';
import { logger } from './lib/logger.js';

/**
 * Zero-dependency local demo: spins up an in-memory MongoDB, seeds the curated
 * catalogue, and serves the API — so `npm run dev:demo` works with no external
 * database. Prices start empty (run `npm run scrape` against live retailers to
 * populate them); the compare flow, scorecard and placeholder verdict all work.
 */
// Demo-only fallbacks so the stack runs with no .env. OTP codes print to the
// console; RS256 keys auto-generate ephemerally; the two founders are seeded.
process.env.MAILER_PROVIDER ??= 'console';
process.env.SUPERADMIN_EMAILS ??= 'daniel.hardman@automatorr.com,abishai.bajaj@automatorr.com';

async function main(): Promise<void> {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  const cfg = loadConfig();

  await connectDb({ uri: mongod.getUri() });
  await ComponentModel.init();
  await AffiliateLinkModel.init();
  await loadAffiliateConfigs();
  await seedDatabase();
  await seedDemoPrices();
  await seedDemoEvents();
  await seedSuperadmins();

  const app = createApp();
  app.listen(cfg.PORT, () => {
    logger.info(`DEMO API (in-memory Mongo) on http://localhost:${cfg.PORT}`);
    logger.info('Seeded catalogue ready. Start the client with: npm run dev --workspace client');
  });

  const shutdown = async () => {
    await mongod.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  logger.error('Demo server failed', err);
  process.exitCode = 1;
});
