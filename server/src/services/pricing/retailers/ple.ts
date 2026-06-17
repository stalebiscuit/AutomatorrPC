import * as cheerio from 'cheerio';
import type { Component } from '@automatorr/shared';
import { type RetailerAdapter, searchQuery, parseAud } from './types.js';

/** PLE Computers (AU). Implemented adapter. */
export const ple: RetailerAdapter = {
  store: 'PLE Computers',
  domain: 'www.ple.com.au',

  buildSearchUrl(c: Component): string {
    return `https://www.ple.com.au/Catalogue/Search?q=${encodeURIComponent(searchQuery(c))}`;
  },

  parse(html: string, c: Component) {
    const $ = cheerio.load(html);
    const card = $('.productListItem, .product-tile, .grid-product').first();
    const priceText = card.find('.price, .product-price, [itemprop="price"]').first().text() ||
      card.find('[data-price]').first().attr('data-price') ||
      card.text();
    const price = parseAud(priceText.startsWith('$') ? priceText : `$${priceText}`);
    if (price === null) return null;
    const href = card.find('a').first().attr('href');
    const url = href ? new URL(href, 'https://www.ple.com.au').toString() : this.buildSearchUrl(c);
    return { price, url };
  },
};
