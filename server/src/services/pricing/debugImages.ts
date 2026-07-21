/**
 * DB-4 Tier 2 diagnostic — render each retailer's search page for one real part and
 * dump the HTML so the card/image selectors can be fixed against the real DOM.
 *
 *   npm run db4:debug --workspace server            # uses a well-known image-less part
 *   npm run db4:debug --workspace server -- noctua  # search term hint (matches a part name)
 *
 * Writes docs/db4-debug/<store>.html (in the repo, so it can be inspected) and logs, per
 * retailer: HTTP status, HTML size, <img> count, and what the current parse/parseImage return.
 * Needs Playwright (see renderFetcher.ts).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { connectDb, disconnectDb } from '../../db.js';
import { ComponentModel } from '../../models/index.js';
import { serializeComponent } from '../../lib/serialize.js';
import { loadConfig } from '../../config.js';
import { RETAILERS } from './retailers/index.js';
import { createRenderFetcher } from './renderFetcher.js';
import { logger } from '../../lib/logger.js';

async function main(): Promise<void> {
  const hint = process.argv.slice(2).find((a) => !a.startsWith('-'));
  await connectDb();

  const imageless = { $or: [{ imageUrl: null }, { imageUrl: { $exists: false } }] };
  const doc =
    (hint ? await ComponentModel.findOne({ ...imageless, name: new RegExp(hint, 'i') }) : null) ??
    (await ComponentModel.findOne({ ...imageless, name: /corsair|noctua|be quiet|fractal|nzxt|seasonic/i })) ??
    (await ComponentModel.findOne(imageless));
  if (!doc) {
    logger.error('No image-less part found to debug.');
    await disconnectDb();
    return;
  }
  const component = serializeComponent(doc);
  logger.info(`Debugging with: ${component.category} / "${component.name}"`);

  const outDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..', 'docs', 'db4-debug');
  mkdirSync(outDir, { recursive: true });

  const fetcher = await createRenderFetcher({ userAgent: loadConfig().SCRAPE_USER_AGENT, waitMs: 1800 });
  try {
    for (const r of RETAILERS) {
      const url = r.buildSearchUrl(component);
      let status = 0;
      let html = '';
      try {
        const res = await fetcher(url);
        status = res.status;
        html = await res.text();
      } catch (err) {
        logger.warn(`[${r.store}] fetch error`, err);
      }
      const file = path.join(outDir, `${r.store.replace(/\W+/g, '_')}.html`);
      writeFileSync(file, html);
      const $ = cheerio.load(html);
      logger.info(
        `[${r.store}] status=${status} html=${html.length}b imgs=${$('img').length} ` +
          `price=${JSON.stringify(r.parse(html, component))} image=${r.parseImage?.(html, component) ?? 'null'} → ${path.relative(process.cwd(), file)}`,
      );
    }
  } finally {
    await fetcher.close();
  }
  logger.info('Dumped rendered HTML to docs/db4-debug/ — share those files (or the repo) to fix selectors.');
  await disconnectDb();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    logger.error('db4:debug failed', err);
    process.exitCode = 1;
  });
}
