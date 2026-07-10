import { CATEGORIES, type Category } from '@automatorr/shared';
import { ComponentModel } from '../models/index.js';
import { connectDb, disconnectDb } from '../db.js';
import { logger } from '../lib/logger.js';
import { normaliseIndex } from '../services/scoring.js';
import { buildCsvIndex, lookupCsv, type CsvIndex } from './csvParser.js';
import { loadSeedFile, type SeedComponent } from './seedData.js';

export interface SeedSummary {
  category: Category;
  total: number;
  matchedFromCsv: number;
  usedFallback: number;
}

/** CSV `Type` values needed to seed a category (storage spans SSD + HDD). */
function csvTypesFor(category: Category): string[] {
  switch (category) {
    case 'cpu':
      return ['CPU'];
    case 'gpu':
      return ['GPU'];
    case 'ram':
      return ['RAM'];
    case 'storage':
      return ['SSD', 'HDD'];
  }
}

function buildDoc(category: Category, c: SeedComponent, csvIndex: CsvIndex) {
  const row = lookupCsv(csvIndex, c.csv.type, c.csv.model);
  const ubRaw = row?.ubRaw ?? c.fallbackUbRaw;
  const ubSource = row?.url ?? `fallback:seed/data/${category}.json`;
  const performanceIndex = normaliseIndex(category, ubRaw);
  const now = new Date();

  const subtype = typeof c.specs.subtype === 'string' ? c.specs.subtype : undefined;

  return {
    matchedFromCsv: Boolean(row),
    doc: {
      category,
      brand: c.brand,
      name: c.name,
      slug: c.slug,
      imageUrl: c.imageUrl ?? null,
      specs: c.specs,
      benchmark: { ubRaw, ubSource },
      performanceIndex,
      // demo/sample prices from the seed file; a live scraper run overwrites them.
      prices: c.prices.map((p) => ({
        store: p.store,
        price: p.price,
        currency: 'AUD',
        url: p.url,
        lastUpdated: now,
      })),
      provenance: {
        specSourceUrl: c.specSourceUrl,
        csvRow: row ? `${row.type},${row.brand},${row.model},rank=${row.rank},bench=${row.ubRaw}` : undefined,
        subtypeSource: subtype === 'ssd' || subtype === 'hdd' ? subtype : undefined,
        seededAt: new Date(),
        unknownFields: c.unknownFields,
      },
    },
  };
}

/** Idempotent upsert of all curated components. Re-runnable (keyed by category+slug). */
export async function seedDatabase(): Promise<SeedSummary[]> {
  const summaries: SeedSummary[] = [];

  for (const category of CATEGORIES) {
    const seed = loadSeedFile(category);
    const csvIndex = buildCsvIndex(csvTypesFor(category));
    if (csvIndex.missingFiles.length > 0) {
      logger.warn(
        `[${category}] missing CSV files (${csvIndex.missingFiles.join(', ')}) — using seed fallback ubRaw`,
      );
    }

    let matched = 0;
    for (const c of seed.components) {
      const { doc, matchedFromCsv } = buildDoc(category, c, csvIndex);
      if (matchedFromCsv) matched++;
      else logger.warn(`[${category}] no CSV match for "${c.csv.model}" — using fallback ubRaw`);

      await ComponentModel.updateOne(
        { category, slug: c.slug },
        { $set: doc, $setOnInsert: { createdAt: new Date() } },
        { upsert: true },
      );
    }

    const summary: SeedSummary = {
      category,
      total: seed.components.length,
      matchedFromCsv: matched,
      usedFallback: seed.components.length - matched,
    };
    summaries.push(summary);
    logger.info(
      `[${category}] seeded ${summary.total} (CSV-matched ${summary.matchedFromCsv}, fallback ${summary.usedFallback})`,
    );
  }

  return summaries;
}

/** CLI entrypoint: `npm run seed`. */
async function main(): Promise<void> {
  await connectDb();
  await ComponentModel.init();
  const summaries = await seedDatabase();
  const grand = summaries.reduce((n, s) => n + s.total, 0);
  logger.info(`Seed complete — ${grand} components across ${summaries.length} categories`);
  await disconnectDb();
}

// Run only when invoked directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    logger.error('Seed failed', err);
    process.exitCode = 1;
  });
}
