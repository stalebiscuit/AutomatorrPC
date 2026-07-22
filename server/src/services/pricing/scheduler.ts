import cron from 'node-cron';
import { loadConfig } from '../../config.js';
import { logger } from '../../lib/logger.js';
import { getPriceProvider } from './PriceProvider.js';
import { refreshAllPrices } from './refreshPrices.js';

let task: cron.ScheduledTask | null = null;

/** Register the nightly price-refresh cron (spec §12). Fails soft. */
export function startPriceScheduler(): void {
  const cfg = loadConfig();
  if (!cron.validate(cfg.SCRAPE_CRON)) {
    logger.error(`Invalid SCRAPE_CRON "${cfg.SCRAPE_CRON}" — price scheduler not started`);
    return;
  }
  task = cron.schedule(cfg.SCRAPE_CRON, () => {
    void runPriceRefresh();
  });
  logger.info(`Price scheduler registered (cron: ${cfg.SCRAPE_CRON})`);
}

export function stopPriceScheduler(): void {
  task?.stop();
  task = null;
}

/** One scrape run — used by the cron and `npm run scrape`. Never throws.
 *  With SCRAPE_RENDER=true it spins up a Playwright render fetcher for fuller
 *  coverage and tears it down afterwards. */
export async function runPriceRefresh(): Promise<void> {
  const cfg = loadConfig();
  let close: (() => Promise<void>) | undefined;
  try {
    let provider;
    if (cfg.SCRAPE_RENDER) {
      const { RETAILERS } = await import('./retailers/index.js');
      const { createRenderFetcher } = await import('./renderFetcher.js');
      const { ScraperPriceProvider } = await import('./ScraperPriceProvider.js');
      const rf = await createRenderFetcher({ waitMs: 1400 });
      close = rf.close;
      provider = new ScraperPriceProvider({
        fetcher: rf,
        adapters: RETAILERS.filter((a) => !a.disabled),
      });
      logger.info('[scheduler] price refresh in RENDER mode (Playwright)');
    } else {
      provider = await getPriceProvider();
    }
    await refreshAllPrices(provider);
  } catch (err) {
    logger.error('Price refresh job failed', err);
  } finally {
    if (close) await close().catch(() => undefined);
  }
}
