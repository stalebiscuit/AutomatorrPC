import cron from 'node-cron';
import { loadConfig } from '../../config.js';
import { logger } from '../../lib/logger.js';
import { ingestBuilderCatalog } from './ingest.js';

let task: cron.ScheduledTask | null = null;

/** Register the catalogue-ingest cron (plan §4.1.1). Fails soft. */
export function startCatalogIngestScheduler(): void {
  const cfg = loadConfig();
  if (!cron.validate(cfg.CATALOG_INGEST_CRON)) {
    logger.error(
      `Invalid CATALOG_INGEST_CRON "${cfg.CATALOG_INGEST_CRON}" — ingest scheduler not started`,
    );
    return;
  }
  task = cron.schedule(cfg.CATALOG_INGEST_CRON, () => {
    void runCatalogIngest();
  });
  logger.info(`Catalog ingest scheduler registered (cron: ${cfg.CATALOG_INGEST_CRON})`);
}

export function stopCatalogIngestScheduler(): void {
  task?.stop();
  task = null;
}

/** One ingest run — used by the cron and `npm run ingest`. Never throws. */
export async function runCatalogIngest(): Promise<void> {
  try {
    await ingestBuilderCatalog();
  } catch (err) {
    logger.error('Catalog ingest job failed', err);
  }
}
