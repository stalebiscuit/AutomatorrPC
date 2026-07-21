import { fileURLToPath } from 'node:url';
import { connectDb, disconnectDb } from '../../db.js';
import { ComponentModel } from '../../models/index.js';
import { logger } from '../../lib/logger.js';
import type { PriceProvider } from './PriceProvider.js';
import { ScraperPriceProvider } from './ScraperPriceProvider.js';
import { RETAILERS } from './retailers/index.js';
import { refreshAllPrices } from './refreshPrices.js';

/**
 * Manual price refresh: `npm run scrape`.
 *   -- --render         run JS-rendered stores through Playwright (PCCaseGear/Mwave return quotes)
 *   -- --limit 20       only price the first N components (quality-check sample before a full run)
 */
async function main(): Promise<void> {
  const render = process.argv.includes('--render');
  const li = process.argv.indexOf('--limit');
  const limit = li >= 0 ? Number(process.argv[li + 1]) : undefined;

  await connectDb();
  await ComponentModel.init();

  const adapters = RETAILERS.filter((a) => !a.disabled); // skip gated (Scorptec) + stub (Amazon/Centre Com) stores
  logger.info(`[scrape] price stores: ${adapters.map((a) => a.store).join(', ')}`);
  let provider: PriceProvider;
  let close: (() => Promise<void>) | undefined;
  if (render) {
    const { createRenderFetcher } = await import('./renderFetcher.js');
    const rf = await createRenderFetcher({ waitMs: 1400 });
    provider = new ScraperPriceProvider({ fetcher: rf, adapters });
    close = rf.close;
    logger.info('[scrape] rendering enabled (Playwright) — needed for PCCaseGear');
  } else {
    provider = new ScraperPriceProvider({ adapters });
  }
  if (limit) logger.info(`[scrape] limiting to first ${limit} components`);

  await refreshAllPrices(provider, { limit });
  if (close) await close();
  await disconnectDb();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    logger.error('Scrape failed', err);
    process.exitCode = 1;
  });
}
