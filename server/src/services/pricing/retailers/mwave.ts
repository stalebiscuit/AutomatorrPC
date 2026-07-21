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
    const card = $('ul.productList > li').first();
    if (card.length === 0) return null;
    const price = parseAud(card.find('div.price div.current').first().text() || card.text());
    if (price === null) return null;
    const href = card.find('a.sliclickLogging').first().attr('href') || card.find('a').first().attr('href');
    const url = href ? new URL(href, 'https://www.mwave.com.au').toString() : this.buildSearchUrl(c);
    return { price, url };
  },

  parseImage(html: string, c: Component) {
    const img = firstCardImage(html, 'ul.productList > li img', 'https://www.mwave.com.au');
    if (!img) return null;
    return titleMatches(c.name, firstCardText(html, 'ul.productList > li')) ? img : null;
  },
};
