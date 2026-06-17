import cron from 'node-cron';
import { loadConfig } from '../config.js';
import { logger } from '../lib/logger.js';
import { buildRollups } from './analytics.js';

let task: cron.ScheduledTask | null = null;

/** Register the analytics rollup cron (spec §6, §7). Fails soft. */
export function startRollupScheduler(): void {
  const cfg = loadConfig();
  if (!cron.validate(cfg.ROLLUP_CRON)) {
    logger.error(`Invalid ROLLUP_CRON "${cfg.ROLLUP_CRON}" — rollup scheduler not started`);
    return;
  }
  task = cron.schedule(cfg.ROLLUP_CRON, () => {
    void runRollups();
  });
  logger.info(`Rollup scheduler registered (cron: ${cfg.ROLLUP_CRON})`);
}

export function stopRollupScheduler(): void {
  task?.stop();
  task = null;
}

export async function runRollups(): Promise<void> {
  try {
    await buildRollups();
  } catch (err) {
    logger.error('Rollup job failed', err);
  }
}
