import * as cheerio from 'cheerio';
import type { Component } from '@automatorr/shared';
import { type RetailerAdapter, searchQuery, parseAud } from './types.js';

/** PCCaseGear (AU). Implemented adapter. */
export const pccasegear: RetailerAdapter = {
  store: 'PCCaseGear',
  domain: 'www.pccasegear.com',

  buildSearchUrl(c: Component): string {
    return `https://www.pccasegear.com/search?q=${encodeURIComponent(searchQuery(c))}`;
  },

  parse(html: string, c: Component) {
    const $ = cheerio.load(html);
    const card = $('.product-container, .product, li.product').first();
    const priceText = card.find('.price, .product-price').first().text() || card.text();
    const price = parseAud(priceText);
    if (price === null) return null;
    const href = card.find('a').first().attr('href');
    const url = href
      ? new URL(href, 'https://www.pccasegear.com').toString()
      : this.buildSearchUrl(c);
    return { price, url };
  },
};
