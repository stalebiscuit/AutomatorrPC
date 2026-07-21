/**
 * Live-store crawl → decode → upsert pipeline. Walks a retailer's category listing pages,
 * decodes each tile's specs+score from its name, and upserts builder-ready components (with the
 * crawled price + image already attached). PLE is server-rendered (plain fetch); JS stores use
 * the Playwright renderFetcher via --render.
 *
 *   npm run crawl:ple --workspace server                 # DRY RUN — reports what it would add
 *   npm run crawl:ple --workspace server -- --apply       # upsert to Mongo
 *   npm run crawl:ple --workspace server -- --apply gpu    # limit to one category
 */
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { normaliseIndex } from '../../scoring.js';
import { canonicalSlug } from '../canonical.js';
import { logger } from '../../../lib/logger.js';
import type { Fetcher } from '../../pricing/PriceProvider.js';
import { crawlCategory, type StoreCrawlConfig } from './crawlStore.js';
import { decodeCrawledPart, cpuKey, type CpuBench } from './decodeSpecs.js';
import { PLE_CONFIG } from './stores/ple.js';
import { SCORPTEC_CONFIG } from './stores/scorptec.js';
import { PCCASEGEAR_CONFIG } from './stores/pccasegear.js';
import type { BuilderCategory, Category } from '@automatorr/shared';

const BENCH = new Set<BuilderCategory>(['cpu', 'gpu', 'ram', 'storage']);
const plainFetch: Fetcher = (url, init) => fetch(url, init as RequestInit);

/** Load the UserBenchmark CPU scores (model -> reference-scale ubRaw) for the crawl CPU decoder. */
function loadCpuBench(): CpuBench {
  const file = fileURLToPath(new URL('../../../seed/csv/CPU_UserBenchmarks.csv', import.meta.url));
  const map: CpuBench = new Map();
  for (const line of readFileSync(file, 'utf8').replace(/\r/g, '').split('\n').slice(1)) {
    const p = line.split(',');
    const model = p[3]?.trim();
    const score = Number(p[5]);
    if (model && score > 0) map.set(cpuKey(model), { model, score });
  }
  return map;
}

async function crawlStore(cfg: StoreCrawlConfig, apply: boolean, onlyCat?: BuilderCategory): Promise<void> {
  const { connectDb, disconnectDb } = await import('../../../db.js');
  const { ComponentModel } = await import('../../../models/index.js');
  await connectDb();
  await ComponentModel.init();

  const render = process.argv.includes('--render');
  let fetcher: Fetcher = plainFetch;
  let close: (() => Promise<void>) | undefined;
  if (render) {
    const { createRenderFetcher } = await import('../../pricing/renderFetcher.js');
    const rf = await createRenderFetcher({ waitMs: 1400 });
    fetcher = rf;
    close = rf.close;
  }

  const cats = (Object.keys(cfg.categoryPath) as BuilderCategory[]).filter((c) => !onlyCat || c === onlyCat);
  const cpuBench = cats.includes('cpu') ? loadCpuBench() : undefined;
  let upserted = 0, decoded = 0, skipped = 0, crawled = 0;
  const skippedNames: string[] = [];
  const now = new Date();

  for (const category of cats) {
    const tiles = await crawlCategory(cfg, category, fetcher);
    crawled += tiles.length;
    let catDecoded = 0, catUpserted = 0;
    for (const t of tiles) {
      const d = decodeCrawledPart(category, t.name, cpuBench);
      if (!d || !d.builderReady) { skipped += 1; if (!apply) skippedNames.push(t.name); continue; }
      decoded += 1; catDecoded += 1;
      const slug = canonicalSlug(t.name);
      const ubRaw = d.ubRaw ?? 0;
      const performanceIndex = BENCH.has(category) && ubRaw > 0 ? normaliseIndex(category as Category, ubRaw) : 0;
      if (!apply) continue;
      // Purely additive: only INSERT brand-new slugs, never overwrite an existing part —
      // protects hand-curated specs from being clobbered by a thin listing decode.
      const res = await ComponentModel.updateOne(
        { category, slug },
        {
          $setOnInsert: {
            category, brand: d.brand, name: t.name, slug,
            imageUrl: t.imageUrl ?? null,
            specs: d.specs,
            benchmark: { ubRaw, ubSource: `crawl:${cfg.store}` },
            performanceIndex,
            prices: t.price ? [{ store: cfg.store, price: t.price, currency: 'AUD', url: t.url ?? cfg.base, lastUpdated: now }] : [],
            provenance: { specSourceUrl: t.url ?? cfg.base, seededAt: now },
            createdAt: now,
          },
        },
        { upsert: true },
      );
      if (res.upsertedCount) { upserted += 1; catUpserted += 1; }
    }
    logger.info(`[crawl:${cfg.store}] ${category}: crawled ${tiles.length}, builder-ready ${catDecoded}, upserted ${apply ? catUpserted : 0}`);
  }

  if (!apply && skippedNames.length) logger.info(`[dry-run] skipped names (${skippedNames.length}): ` + skippedNames.slice(0, 60).join(' | '));
  logger.info(`Crawl ${apply ? 'APPLIED' : 'DRY RUN'} — ${crawled} tiles, ${decoded} decoded builder-ready, ${skipped} skipped${apply ? `, ${upserted} upserted` : ''}`);
  if (close) await close();
  await disconnectDb();
}

const STORES: Record<string, StoreCrawlConfig> = { ple: PLE_CONFIG, scorptec: SCORPTEC_CONFIG, pccasegear: PCCASEGEAR_CONFIG };

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const storeKey = process.argv.find((a) => STORES[a]) ?? 'ple';
  const onlyCat = process.argv.find((a) => ['cpu','gpu','ram','storage','cooler','case','psu','motherboard','monitor'].includes(a)) as BuilderCategory | undefined;
  await crawlStore(STORES[storeKey]!, apply, onlyCat);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => { logger.error('crawl failed', err); process.exitCode = 1; });
}
