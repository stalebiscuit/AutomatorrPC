import * as cheerio from 'cheerio';
import type { Component } from '@automatorr/shared';
import { type RetailerAdapter, searchQuery, parseAud } from './types.js';

/** Scorptec (AU). Implemented adapter — parses the first result card's price. */
export const scorptec: RetailerAdapter = {
  store: 'Scorptec',
  domain: 'www.scorptec.com.au',

  buildSearchUrl(c: Component): string {
    return `https://www.scorptec.com.au/search?keyword=${encodeURIComponent(searchQuery(c))}`;
  },

  parse(html: string, c: Component) {
    const $ = cheerio.load(html);
    // First product card → its price node.
    const card = $('.product-list-detail, .product-item').first();
    const priceText = card.find('.price, .product-price').first().text() || card.text();
    const price = parseAud(priceText);
    if (price === null) return null;
    const href = card.find('a').first().attr('href');
    const url = href
      ? new URL(href, 'https://www.scorptec.com.au').toString()
      : this.buildSearchUrl(c);
    return { price, url };
  },
};
