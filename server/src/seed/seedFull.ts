import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import type { AnyBulkWriteOperation } from 'mongoose';
import { ComponentModel, type ComponentDoc } from '../models/index.js';
import { connectDb, disconnectDb } from '../db.js';
import { logger } from '../lib/logger.js';
import { COMPONENTS_SNAPSHOT } from './exportSnapshot.js';

interface SnapshotComponent {
  category: string;
  slug: string;
  prices?: unknown;
  [key: string]: unknown;
}

/**
 * Restore the full parts catalogue from the committed snapshot
 * (server/src/seed/snapshot/components.json), produced by `npm run seed:export`.
 *
 * Idempotent + non-destructive, matching the curated seeder's contract:
 * upserts keyed by {category, slug}; spec/benchmark/provenance fields are
 * refreshed on every run via $set, but `prices` are written only on insert
 * ($setOnInsert) so a re-run never clobbers live scraped prices — the
 * deployment runbook re-seeds against a live DB.
 */
export async function restoreComponentSnapshot(): Promise<number> {
  if (!existsSync(COMPONENTS_SNAPSHOT)) {
    throw new Error(
      `No parts snapshot found at ${COMPONENTS_SNAPSHOT}.\n` +
        `Generate one from a fully-populated database with:\n` +
        `  npm run seed:export --workspace server\n` +
        `or seed the small curated sample instead with:\n` +
        `  npm run seed:sample --workspace server`,
    );
  }

  const docs = JSON.parse(readFileSync(COMPONENTS_SNAPSHOT, 'utf8')) as SnapshotComponent[];
  if (docs.length === 0) return 0;

  const now = new Date();
  // Snapshot docs are dynamic JSON, so the update payload is untyped here;
  // Mongoose casts each field to the schema on write (ISO strings → Date, etc.).
  const ops = docs.map(({ category, slug, prices, ...rest }) => ({
    updateOne: {
      filter: { category, slug },
      update: {
        $set: rest,
        $setOnInsert: {
          createdAt: now,
          ...(prices !== undefined ? { prices } : {}),
        },
      },
      upsert: true,
    },
  })) as unknown as AnyBulkWriteOperation<ComponentDoc>[];

  await ComponentModel.bulkWrite(ops, { ordered: false });
  return ops.length;
}

/** CLI entrypoint: `npm run seed`. */
async function main(): Promise<void> {
  await connectDb();
  await ComponentModel.init();
  const restored = await restoreComponentSnapshot();
  const total = await ComponentModel.estimatedDocumentCount();
  logger.info(`Seed complete — restored ${restored} parts from snapshot (collection holds ${total})`);
  await disconnectDb();
}

// Run only when invoked directly (not when imported by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    logger.error('Seed failed', err);
    process.exitCode = 1;
  });
}
