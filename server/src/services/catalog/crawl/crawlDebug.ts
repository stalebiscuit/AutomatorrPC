/**
 * Crawl selector debugger. Renders ONE listing URL and reports what's actually in the DOM —
 * status, size, blockers, counts for candidate tile selectors, and the most common repeated
 * class tokens — so we can pin the right selector when a store returns 0 tiles.
 *
 *   npm run crawl:debug --workspace server -- "https://www.scorptec.com.au/product/cases/all-cases"
 *   npm run crawl:debug --workspace server -- "<url>" --plain      # skip Playwright (plain fetch)
 */
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import type { Fetcher } from '../../pricing/PriceProvider.js';
import { logger } from '../../../lib/logger.js';

async function main(): Promise<void> {
  const url = process.argv.find((a) => a.startsWith('http'));
  if (!url) { logger.error('usage: crawl:debug -- "<url>" [--plain]'); process.exitCode = 1; return; }
  const plain = process.argv.includes('--plain');

  let fetcher: Fetcher;
  let close: (() => Promise<void>) | undefined;
  if (plain) {
    fetcher = async (u, init) => { const r = await fetch(u, init as RequestInit); return { ok: r.ok, status: r.status, text: () => r.text() }; };
  } else {
    const { createRenderFetcher } = await import('../../pricing/renderFetcher.js');
    const rf = await createRenderFetcher({ waitMs: 3000 });
    fetcher = rf; close = rf.close;
  }

  const res = await fetcher(url, { headers: { accept: 'text/html' } });
  const html = await res.text();
  const $ = cheerio.load(html);
  logger.info(`status ${res.status} · ${html.length} bytes · title "${$('title').text().trim().slice(0, 90)}"`);

  const low = html.toLowerCase();
  for (const b of ['just a moment', 'captcha', 'enable javascript', 'access denied', 'are you a robot', 'cf-browser-verification']) {
    if (low.includes(b)) logger.warn(`  ⚠ possible blocker phrase: "${b}"`);
  }

  const candidates = [
    'div.product-list-detail', '.product-list-detail', '.row.product-list-detail',
    'div.product-container', '.product-container', 'a.product-title', '.detail-product-title',
    '.product-item', '[class*=product-list]', '[class*=product-card]', '[class*=product-tile]',
    '[class*=productItem]', '.ss__result', 'article[class*=product]', '[data-product-id]',
  ];
  logger.info('  selector counts:');
  for (const sel of candidates) { const n = $(sel).length; if (n) logger.info(`    ${sel} -> ${n}`); }

  const freq: Record<string, number> = {};
  $('div,li,article,a').each((_i, el) => {
    const c = $(el).attr('class'); if (!c) return;
    for (const t of c.split(/\s+/)) if (t && /prod|item|card|tile|result/i.test(t)) freq[t] = (freq[t] ?? 0) + 1;
  });
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 25);
  logger.info('  product-ish class tokens (repeat count): ' + (top.map(([k, v]) => `${k}(${v})`).join('  ') || '(none found)'));

  if (close) await close();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => { logger.error('crawl:debug failed', err); process.exitCode = 1; });
}
