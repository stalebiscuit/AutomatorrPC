import { connectDb, disconnectDb } from '../../db.js';
import { ComponentModel } from '../../models/index.js';
import { logger } from '../../lib/logger.js';
import { getPriceProvider } from './PriceProvider.js';
import { refreshAllPrices } from './refreshPrices.js';

/** Manual price refresh: `npm run scrape`. */
async function main(): Promise<void> {
  await connectDb();
  await ComponentModel.init();
  const provider = await getPriceProvider();
  await refreshAllPrices(provider);
  await disconnectDb();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    logger.error('Scrape failed', err);
    process.exitCode = 1;
  });
}
