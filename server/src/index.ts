import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDb } from './db.js';
import {
  ComponentModel,
  BuildModel,
  VerdictModel,
  SearchEventModel,
  ClickEventModel,
  TrendRollupModel,
  MatchAliasModel,
  MatchReviewModel,
  AffiliateLinkModel,
} from './models/index.js';
import { logger } from './lib/logger.js';
import { startPriceScheduler } from './services/pricing/scheduler.js';
import { startRollupScheduler } from './services/rollupScheduler.js';
import { startCatalogIngestScheduler } from './services/catalog/ingestScheduler.js';
import { loadAffiliateConfigs } from './services/affiliate/affiliateService.js';

async function main(): Promise<void> {
  const cfg = loadConfig();

  await connectDb();
  // Ensure declared indexes exist on startup (spec §6 / Phase 1 DoD).
  await Promise.all([
    ComponentModel.init(),
    BuildModel.init(),
    VerdictModel.init(),
    SearchEventModel.init(),
    ClickEventModel.init(),
    TrendRollupModel.init(),
    MatchAliasModel.init(),
    MatchReviewModel.init(),
    AffiliateLinkModel.init(),
  ]);
  logger.info('Indexes ensured for all collections');

  await loadAffiliateConfigs();
  logger.info('Affiliate link configs loaded');

  const app = createApp();
  app.listen(cfg.PORT, () => {
    logger.info(`Automatorr API listening on http://localhost:${cfg.PORT} (env: ${cfg.NODE_ENV})`);
  });

  // Background jobs (fail soft, never inline on a request).
  startPriceScheduler();
  startRollupScheduler();
  startCatalogIngestScheduler();
}

main().catch((err) => {
  logger.error('Fatal startup error', err);
  process.exitCode = 1;
});
