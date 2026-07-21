/**
 * CLI: `npm run icecat:enrich [seedFile]` — enrich known parts from Icecat and
 * upsert them into the shared catalogue. Reads identifiers from
 * server/src/seed/icecat-seeds.json by default. Reports per-seed success/failure
 * so you can see which identifiers resolve and tune the list. Runs against the
 * live Icecat API with your ICECAT_* credentials (server/.env).
 */
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { BUILDER_CATEGORIES } from '@automatorr/shared';
import { connectDb, disconnectDb } from '../../../db.js';
import { ComponentModel } from '../../../models/index.js';
import { logger } from '../../../lib/logger.js';
import type { NormalizedPart } from '../ingest.js';
import { IcecatSpecSource, upsertIcecatParts, type IcecatSeed } from './source.js';
import { IcecatError } from './client.js';

const SeedSchema = z.object({
  category: z.enum(BUILDER_CATEGORIES),
  id: z
    .object({
      gtin: z.string().optional(),
      brand: z.string().optional(),
      productCode: z.string().optional(),
      icecatId: z.union([z.string(), z.number()]).optional(),
    })
    .refine((v) => Boolean(v.gtin || v.icecatId || (v.brand && v.productCode)), {
      message: 'each id needs gtin, icecatId, or brand + productCode',
    }),
});
const FileSchema = z.object({ seeds: z.array(SeedSchema).min(1) });

function loadSeeds(path: string): IcecatSeed[] {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  const parsed = FileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      'Invalid icecat seed file:\n' +
        parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n'),
    );
  }
  return parsed.data.seeds as IcecatSeed[];
}

async function main(): Promise<void> {
  const defaultPath = join(fileURLToPath(new URL('../../../seed/', import.meta.url)), 'icecat-seeds.json');
  const path = process.argv[2] ?? defaultPath;
  const seeds = loadSeeds(path);
  const source = IcecatSpecSource.fromConfig();

  await connectDb();
  await ComponentModel.init();

  const resolved: NormalizedPart[] = [];
  const gated: string[] = []; // 403 → brand needs curation
  const notFound: string[] = []; // 404 → wrong identifier, retry with model name / GTIN
  const other: string[] = [];
  for (const seed of seeds) {
    const brand = seed.id.brand ?? JSON.stringify(seed.id);
    try {
      const part = await source.enrich(seed);
      if (part) {
        resolved.push(part);
        const missing = part.unknownFields.length ? ` — missing critical: ${part.unknownFields.join(', ')}` : '';
        logger.info(`[icecat] ✓ ${part.name} [${part.category}] (${Object.keys(part.specs).length} specs)${missing}`);
      } else {
        other.push(brand);
        logger.warn(`[icecat] ✗ ${JSON.stringify(seed.id)} — could not normalize (no brand/name)`);
      }
    } catch (err) {
      const status = err instanceof IcecatError ? err.status : undefined;
      if (status === 403) {
        gated.push(brand);
        logger.warn(`[icecat] ⊘ ${brand} — 403 GATED (Full-only brand → curate manually)`);
      } else if (status === 404) {
        notFound.push(JSON.stringify(seed.id));
        logger.warn(`[icecat] ? ${JSON.stringify(seed.id)} — 404 NOT FOUND (check MPN, or retry with model name / GTIN)`);
      } else {
        other.push(brand);
        logger.warn(`[icecat] ✗ ${JSON.stringify(seed.id)} — ${(err as Error).message}`);
      }
    }
  }

  const upserted = await upsertIcecatParts(resolved);
  logger.info(
    `Icecat enrich complete — ${upserted} upserted · ${gated.length} gated(403) · ${notFound.length} not-found(404) · ${other.length} other`,
  );
  if (gated.length) logger.info(`  ⊘ Gated brands to CURATE: ${[...new Set(gated)].join(', ')}`);
  if (notFound.length) logger.info(`  ? Not-found (fix identifier): ${notFound.join(' · ')}`);
  await disconnectDb();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    logger.error('Icecat enrich failed', err);
    process.exitCode = 1;
  });
}
