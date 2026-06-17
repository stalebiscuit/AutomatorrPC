import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDb } from './db.js';
import {
  ComponentModel,
  VerdictModel,
  SearchEventModel,
  ClickEventModel,
  TrendRollupModel,
} from './models/index.js';
import { logger } from './lib/logger.js';
import { startPriceScheduler } from './services/pricing/scheduler.js';

async function main(): Promise<void> {
  const cfg = loadConfig();

  await connectDb();
  // Ensure declared indexes exist on startup (spec §6 / Phase 1 DoD).
  await Promise.all([
    ComponentModel.init(),
    VerdictModel.init(),
    SearchEventModel.init(),
    ClickEventModel.init(),
    TrendRollupModel.init(),
  ]);
  logger.info('Indexes ensured for all collections');

  const app = createApp();
  app.listen(cfg.PORT, () => {
    logger.info(`Automatorr API listening on http://localhost:${cfg.PORT} (env: ${cfg.NODE_ENV})`);
  });

  // Background jobs (fail soft, never inline on a request).
  startPriceScheduler();
}

main().catch((err) => {
  logger.error('Fatal startup error', err);
  process.exitCode = 1;
});
