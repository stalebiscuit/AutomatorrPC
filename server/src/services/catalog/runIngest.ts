import { fileURLToPath } from 'node:url';
import { connectDb, disconnectDb } from '../../db.js';
import { ComponentModel } from '../../models/index.js';
import { logger } from '../../lib/logger.js';
import { ingestBuilderCatalog } from './ingest.js';

/** CLI entrypoint: `npm run ingest` — refresh the builder catalogue. */
async function main(): Promise<void> {
  await connectDb();
  await ComponentModel.init();
  const summaries = await ingestBuilderCatalog();
  const total = summaries.reduce((n, s) => n + s.upserted, 0);
  logger.info(`Ingest complete — ${total} parts across ${summaries.length} builder categories`);
  await disconnectDb();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    logger.error('Ingest failed', err);
    process.exitCode = 1;
  });
}
