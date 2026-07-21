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
    const card = $('div.itemGrid2TileStandard').first();
    if (card.length === 0) return null;
    const price = parseAud(card.find('div.itemGrid2TileStandardPrice').first().text() || card.text());
    if (price === null) return null;
    const href = card.find('a').first().attr('href');
    const url = href ? new URL(href, 'https://www.ple.com.au').toString() : this.buildSearchUrl(c);
    return { price, url };
  },

  parseImage(html: string, c: Component) {
    const img = firstCardImage(html, 'img.defaultImage2image.defaultImage2Primary', 'https://www.ple.com.au');
    if (!img) return null;
    return titleMatches(c.name, firstCardText(html, 'div.itemGrid2TileStandard')) ? img : null;
  },
};
