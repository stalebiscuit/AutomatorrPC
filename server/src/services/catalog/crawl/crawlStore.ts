/**
 * Task 5 (scale) — live-store category crawler. Walks a retailer's category listing pages
 * (paginated), extracts every product tile (name / price / image / product URL), and returns
 * the full catalogue for that part type — far beyond the MPN CSV's coverage.
 *
 * Config-driven so each retailer is just selectors + a category→path map. PLE is server-rendered
 * (plain fetch + cheerio); JS stores (Scorptec/PCCaseGear) pass the Playwright renderFetcher.
 *
 * This module is pure/fixture-testable except for the network fetch (injected). Spec decoding +
 * DB upsert happen in a following step (reuses the task-5 decoders).
 */
import * as cheerio from 'cheerio';
import type { BuilderCategory } from '@automatorr/shared';
import { firstCardImage, parseAud } from '../../pricing/retailers/types.js';
import type { Fetcher } from '../../pricing/PriceProvider.js';
import { logger } from '../../../lib/logger.js';

export interface StoreCrawlConfig {
  store: string;
  base: string;
  /** category → one or more listing path templates; {page} is substituted (1-based). */
  categoryPath: Partial<Record<BuilderCategory, string | string[]>>;
  tileSelector: string;
  nameSelector: string;
  priceSelector: string;
  imageSelector: string;
  linkSelector: string;
  /** absolute-ize + clean a scraped image URL (e.g. strip -thumb / unwrap proxy). */
  imageTransform?: (raw: string) => string;
  /** max listing pages to walk per category (safety cap). */
  maxPages?: number;
  /** if set, only keep tiles whose product link contains this substring (e.g. '/products/' — skips bundles/ads). */
  productUrlMustInclude?: string;
}

export interface CrawlTile {
  store: string;
  category: BuilderCategory;
  name: string;
  price: number | null;
  imageUrl: string | null;
  url: string | null;
}

/** Pure: extract every product tile from one rendered listing page. */
export function extractTiles(html: string, category: BuilderCategory, cfg: StoreCrawlConfig): CrawlTile[] {
  const $ = cheerio.load(html);
  const tiles: CrawlTile[] = [];
  $(cfg.tileSelector).each((_i, el) => {
    const card = $(el);
    const name = card.find(cfg.nameSelector).first().text().replace(/\s+/g, ' ').trim();
    if (!name) return;
    const price = parseAud(card.find(cfg.priceSelector).first().text() || card.text());
    const rawImg = firstCardImage($.html(card), cfg.imageSelector, cfg.base);
    const imageUrl = rawImg ? (cfg.imageTransform ? cfg.imageTransform(rawImg) : rawImg) : null;
    const href = card.find(cfg.linkSelector).first().attr('href');
    const url = href ? new URL(href, cfg.base).toString() : null;
    if (cfg.productUrlMustInclude && (!url || !url.includes(cfg.productUrlMustInclude))) return;
    tiles.push({ store: cfg.store, category, name, price, imageUrl, url });
  });
  return tiles;
}

/** Walk all listing pages for one category, de-duplicating by product URL (or name). */
export async function crawlCategory(
  cfg: StoreCrawlConfig,
  category: BuilderCategory,
  fetcher: Fetcher,
): Promise<CrawlTile[]> {
  const templates = cfg.categoryPath[category];
  if (!templates) return [];
  const list = Array.isArray(templates) ? templates : [templates];
  const maxPages = cfg.maxPages ?? 50;
  const seen = new Set<string>(); // spans all sub-listings → cross-list de-dup within the run
  const out: CrawlTile[] = [];

  for (const template of list) {
    for (let page = 1; page <= maxPages; page++) {
      const url = new URL(template.replace('{page}', String(page)), cfg.base).toString();
      let html = '';
      try {
        const res = await fetcher(url, { headers: { accept: 'text/html' } });
        if (!res.ok) break;
        html = await res.text();
      } catch (err) {
        logger.warn(`[crawl:${cfg.store}] ${category} ${url} fetch failed`, err);
        break;
      }
      const tiles = extractTiles(html, category, cfg).filter((t) => {
        const k = t.url ?? t.name;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (tiles.length === 0) break; // no more results on this sub-listing → next sub-listing
      out.push(...tiles);
      logger.info(`[crawl:${cfg.store}] ${category} +${tiles.length} (total ${out.length})`);
    }
  }
  return out;
}
