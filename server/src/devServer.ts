import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb } from './db.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { ComponentModel } from './models/index.js';
import { seedDatabase } from './seed/seed.js';
import { seedDemoEvents } from './seed/demoEvents.js';
import { logger } from './lib/logger.js';

/**
 * Zero-dependency local demo: spins up an in-memory MongoDB, seeds the curated
 * catalogue, and serves the API — so `npm run dev:demo` works with no external
 * database. Prices start empty (run `npm run scrape` against live retailers to
 * populate them); the compare flow, scorecard and placeholder verdict all work.
 */
// Demo-only fallbacks so the stack runs with no .env (admin: admin / demo-password).
process.env.JWT_SECRET ??= 'demo-only-secret-do-not-use-in-prod-0123456789';
process.env.ADMIN_USERNAME ??= 'admin';
process.env.ADMIN_PASSWORD_HASH ??=
  '$2a$10$TNPmur8bxttdMHscuBYI0O8QddrPDrlVmR7MaiTIxZ/EOJf8YCyDe'; // "demo-password"

async function main(): Promise<void> {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  const cfg = loadConfig();

  await connectDb({ uri: mongod.getUri() });
  await ComponentModel.init();
  await seedDatabase();
  await seedDemoEvents();

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
