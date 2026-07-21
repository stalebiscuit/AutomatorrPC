/**
 * DB-4 Tier 2 — source real product images for parts that only have the Tier-1
 * placeholder (imageUrl === null). Reuses the retailer scraper (robots, throttle,
 * retries, isolated failures) and pulls the first result's thumbnail per part.
 *
 *   npm run db4:images --workspace server                        # DRY RUN, plain fetch (fast, low hit rate)
 *   npm run db4:images --workspace server -- --render            # DRY RUN, headless Chromium (real hit rate)
 *   npm run db4:images --workspace server -- --render --apply    # render + save to the DB
 *   npm run db4:images --workspace server -- --render --apply 40 # cap to first 40 parts
 *
 * `--render` needs Playwright (see renderFetcher.ts). Only fills NULL-image parts, so it
 * never touches Icecat photos or the intentional brand-SVG CPU icons. If a saved URL later
 * fails to load, the UI's Thumb falls back to the category placeholder — so this only helps.
 */
import { fileURLToPath } from 'node:url';
import pLimit from 'p-limit';
import { connectDb, disconnectDb } from '../../db.js';
import { ComponentModel } from '../../models/index.js';
import { serializeComponent } from '../../lib/serialize.js';
import { loadConfig } from '../../config.js';
import { ScraperPriceProvider } from './ScraperPriceProvider.js';
import { createRenderFetcher, type RenderFetcher } from './renderFetcher.js';
import { logger } from '../../lib/logger.js';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const render = process.argv.includes('--render');
  const limit = Number(process.argv.find((a) => /^\d+$/.test(a))) || 0;
  const concurrency = render ? 3 : 5;

  await connectDb();
  await ComponentModel.init();

  let renderFetcher: RenderFetcher | null = null;
  if (render) renderFetcher = await createRenderFetcher({ userAgent: loadConfig().SCRAPE_USER_AGENT, waitMs: 1400 });
  const provider = new ScraperPriceProvider({
    ...(renderFetcher ? { fetcher: renderFetcher } : {}),
    // rendering is already slow; a shorter per-domain delay keeps the run tractable
    perDomainDelayMs: render ? 700 : 1500,
    concurrency,
  });

  const query = { $or: [{ imageUrl: null }, { imageUrl: { $exists: false } }] };
  let docs = await ComponentModel.find(query);
  if (limit > 0) docs = docs.slice(0, limit);

  const total = docs.length;
  logger.info(`db4:images (${apply ? 'APPLY' : 'DRY RUN'}${render ? ', RENDER' : ''}) — ${total} image-less part(s) to check`);

  let done = 0;
  let found = 0;
  const perCat: Record<string, number> = {};
  const gate = pLimit(concurrency);

  await Promise.all(
    docs.map((doc) =>
      gate(async () => {
        const component = serializeComponent(doc);
        let img: string | null = null;
        try {
          img = await provider.getImage(component);
        } catch (err) {
          logger.warn(`getImage failed for "${component.name}"`, err);
        }
        if (img) {
          found += 1;
          perCat[doc.category] = (perCat[doc.category] ?? 0) + 1;
          if (apply) {
            doc.set('imageUrl', img);
            await doc.save();
          }
          logger.info(`  ${apply ? 'set' : 'would set'} ${doc.category}/${doc.slug} → ${img}`);
        }
        done += 1;
        if (done % 20 === 0 || done === total) logger.info(`  …progress ${done}/${total} checked, ${found} found`);
      }),
    ),
  );

  logger.info(
    `db4:images done — found ${found}/${total} images${apply ? ' (saved)' : ' (dry run)'}` +
      (found ? ` · ${Object.entries(perCat).map(([c, n]) => `${c}:${n}`).join(' ')}` : ''),
  );

  if (renderFetcher) await renderFetcher.close();
  await disconnectDb();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    logger.error('db4:images failed', err);
    process.exitCode = 1;
  });
}
