import * as cheerio from 'cheerio';
import type { Component } from '@automatorr/shared';
import { type RetailerAdapter, searchQuery, parseAud, firstCardImage, firstCardText, titleMatches } from './types.js';

/**
 * Mwave (AU, Sydney). Server-rendered search — parseable from raw HTML (no render needed).
 * Selectors verified 2026-07 against the live DOM (retailer_scraper_spec).
 */
export const mwave: RetailerAdapter = {
  store: 'Mwave',
  domain: 'www.mwave.com.au',

  buildSearchUrl(c: Component): string {
    // /searchresult?w=... with '+' for spaces.
    return `https://www.mwave.com.au/searchresult?w=${encodeURIComponent(searchQuery(c)).replace(/%20/g, '+')}`;
  },

  parse(html: string, c: Component) {
    const $ = cheerio.load(html);
    // First result card that strictly matches the exact SKU (not just the first tile).
    for (const el of $('ul.productList > li').toArray()) {
      const card = $(el);
      if (!titleMatches(c.name, card.text())) continue;
      const price = parseAud(card.find('div.price div.current').first().text() || card.text());
      if (price === null) continue;
      const href =
        card.find('a.sliclickLogging').first().attr('href') || card.find('a').first().attr('href');
      if (!href) continue;
      return { price, url: new URL(href, 'https://www.mwave.com.au').toString() };
    }
    return null;
  },

  parseImage(html: string, c: Component) {
    const img = firstCardImage(html, 'ul.productList > li img', 'https://www.mwave.com.au');
    if (!img) return null;
    return titleMatches(c.name, firstCardText(html, 'ul.productList > li')) ? img : null;
  },
};
