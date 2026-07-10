import * as cheerio from 'cheerio';
import type { Component } from '@automatorr/shared';
import { type RetailerAdapter, searchQuery, parseAud } from './types.js';

/** Mwave (AU, Sydney). Implemented adapter — parses the first result tile's price. */
export const mwave: RetailerAdapter = {
  store: 'Mwave',
  domain: 'www.mwave.com.au',

  buildSearchUrl(c: Component): string {
    return `https://www.mwave.com.au/search?q=${encodeURIComponent(searchQuery(c))}`;
  },

  parse(html: string, c: Component) {
    const $ = cheerio.load(html);
    const card = $('.productListing, .product-tile, li.product').first();
    const priceText =
      card.find('.price, .product-price, [itemprop="price"]').first().text() || card.text();
    const price = parseAud(priceText);
    if (price === null) return null;
    const href = card.find('a').first().attr('href');
    const url = href
      ? new URL(href, 'https://www.mwave.com.au').toString()
      : this.buildSearchUrl(c);
    return { price, url };
  },
};
