import * as cheerio from 'cheerio';
import type { Component } from '@automatorr/shared';
import { type RetailerAdapter, searchQuery, parseAud, firstCardImage, firstCardText, titleMatches } from './types.js';

/**
 * PCCaseGear (AU). Algolia InstantSearch — results render CLIENT-SIDE, so this adapter only
 * yields data under the headless render fetcher. Image thumbnails carry a '-thumb' suffix;
 * we drop it for the full-size image. Selectors verified 2026-07 (retailer_scraper_spec).
 */
const BASE = 'https://www.pccasegear.com';

export const pccasegear: RetailerAdapter = {
  store: 'PCCaseGear',
  domain: 'www.pccasegear.com',

  buildSearchUrl(c: Component): string {
    // param is 'query' (not 'q').
    return `${BASE}/search?query=${encodeURIComponent(searchQuery(c))}&page=1`;
  },

  parse(html: string, c: Component) {
    const $ = cheerio.load(html);
    const card = $('li.ais-Hits-item > div.product-container.list-view').first();
    if (card.length === 0) return null;
    const price = parseAud(card.find('div.price-box > div.price').first().text() || card.text());
    if (price === null) return null;
    const href = card.find('a.product-title').first().attr('href') || card.find('a').first().attr('href');
    const url = href ? new URL(href, BASE).toString() : this.buildSearchUrl(c);
    return { price, url };
  },

  parseImage(html: string, c: Component) {
    const raw = firstCardImage(html, 'li.ais-Hits-item div.product-container img', BASE);
    if (!raw) return null;
    if (!titleMatches(c.name, firstCardText(html, 'li.ais-Hits-item > div.product-container.list-view'))) return null;
    return raw.replace(/-thumb(\.[a-z]+)(\?|$)/i, '$1$2');
  },
};
