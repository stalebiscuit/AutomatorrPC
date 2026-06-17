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

/** One scrape run — used by the cron and `npm run scrape`. Never throws. */
export async function runPriceRefresh(): Promise<void> {
  try {
    const provider = await getPriceProvider();
    await refreshAllPrices(provider);
  } catch (err) {
    logger.error('Price refresh job failed', err);
  }
}
