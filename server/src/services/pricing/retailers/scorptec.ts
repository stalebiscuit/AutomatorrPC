import * as cheerio from 'cheerio';
import type { Component } from '@automatorr/shared';
import { type RetailerAdapter, searchQuery, parseAud, firstCardImage, firstCardText, titleMatches } from './types.js';

/**
 * Scorptec (AU). SearchSpring/SLI — results render CLIENT-SIDE, so this adapter only
 * yields data when driven by the headless render fetcher. Both the product link and the
 * image are wrapped in proxy/redirect URLs; the real values live in query params
 * (link → ?url=, image → ?f=). Selectors verified 2026-07 (retailer_scraper_spec).
 */
const BASE = 'https://www.scorptec.com.au';

/** Pull a real URL out of a proxy/redirect URL's query param, else return the input. */
function unwrapParam(raw: string, param: string): string {
  try {
    const val = new URL(raw, BASE).searchParams.get(param);
    if (!val) return raw;
    return /^https?:\/\//i.test(val) ? val : new URL(val, BASE).toString();
  } catch {
    return raw;
  }
}

export const scorptec: RetailerAdapter = {
  store: 'Scorptec',
  disabled: true, // Cloudflare bot-wall — can't scrape; affiliate via FlexOffers datafeed instead
  domain: 'www.scorptec.com.au',

  buildSearchUrl(c: Component): string {
    return `${BASE}/search/go?w=${encodeURIComponent(searchQuery(c))}&view=grid&cnt=30`;
  },

  parse(html: string, c: Component) {
    const $ = cheerio.load(html);
    const card = $('div.grid-product-wrapper.sli_content').first();
    if (card.length === 0) return null;
    const price = parseAud(card.find('div.grid-product-price.float-left').first().text() || card.text());
    if (price === null) return null;
    const href = card.find('div.grid-product-title.sli_title a.inherit-class').first().attr('href')
      || card.find('a').first().attr('href');
    const url = href ? unwrapParam(new URL(href, BASE).toString(), 'url') : this.buildSearchUrl(c);
    return { price, url };
  },

  parseImage(html: string, c: Component) {
    const raw = firstCardImage(html, 'div.grid-product-wrapper.sli_content img', BASE);
    if (!raw) return null;
    if (!titleMatches(c.name, firstCardText(html, 'div.grid-product-wrapper.sli_content'))) return null;
    return unwrapParam(raw, 'f');
  },
};
