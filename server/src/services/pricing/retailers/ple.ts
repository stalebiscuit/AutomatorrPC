import * as cheerio from 'cheerio';
import type { Component } from '@automatorr/shared';
import { type RetailerAdapter, searchQuery, parseAud, firstCardImage, firstCardText, titleMatches } from './types.js';

/**
 * PLE Computers (AU). Server-rendered search at /Search/<query> (path segment, NOT ?q=).
 * Selectors verified 2026-07 (retailer_scraper_spec).
 */
export const ple: RetailerAdapter = {
  store: 'PLE Computers',
  domain: 'www.ple.com.au',

  buildSearchUrl(c: Component): string {
    return `https://www.ple.com.au/Search/${encodeURIComponent(searchQuery(c))}`;
  },

  parse(html: string, c: Component) {
    const $ = cheerio.load(html);
    // Walk every result card and take the FIRST that strictly matches the exact
    // SKU — not just the first card on the page (which is often a near variant).
    for (const el of $('div.itemGrid2TileStandard').toArray()) {
      const card = $(el);
      if (!titleMatches(c.name, card.text())) continue;
      const price = parseAud(card.find('div.itemGrid2TileStandardPrice').first().text() || card.text());
      if (price === null) continue;
      const href = card.find('a').first().attr('href');
      if (!href) continue;
      return { price, url: new URL(href, 'https://www.ple.com.au').toString() };
    }
    return null;
  },

  parseImage(html: string, c: Component) {
    const img = firstCardImage(html, 'img.defaultImage2image.defaultImage2Primary', 'https://www.ple.com.au');
    if (!img) return null;
    return titleMatches(c.name, firstCardText(html, 'div.itemGrid2TileStandard')) ? img : null;
  },
};
