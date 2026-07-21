import * as cheerio from 'cheerio';
import type { Component } from '@automatorr/shared';
import { type RetailerAdapter, searchQuery, parseAud, titleMatches } from './types.js';

/**
 * Umart + MSY share one platform (server-rendered `search.php?keywords=`, `div.goods-item`
 * result tiles). MSY was acquired by Umart, so a single adapter shape covers both — only the
 * domain differs. Verified reachable 2026-07 (crawl:debug: 200, goods-item ×20). Price is the
 * first $ amount in the matched tile; the titleMatches guard rejects a wrong first result.
 */
function umartLike(store: string, domain: string): RetailerAdapter {
  const base = `https://${domain}`;
  return {
    store,
    domain,
    disabled: true, // robots.txt disallows the search path — scrape excluded; affiliate via Umart/CF datafeed
    buildSearchUrl(c: Component): string {
      return `${base}/search.php?cat_id=&keywords=${encodeURIComponent(searchQuery(c))}`;
    },
    parse(html: string, c: Component) {
      const $ = cheerio.load(html);
      const card = $('div.goods-item, [data-product-id]').first();
      if (card.length === 0) return null;
      if (!titleMatches(c.name, card.text())) return null; // reject a mismatched first result
      const price = parseAud(card.find('[class*="price"]').first().text() || card.text());
      if (price === null) return null;
      const href = card.find('a[href]').first().attr('href');
      const url = href ? new URL(href, base).toString() : this.buildSearchUrl(c);
      return { price, url };
    },
  };
}

export const umart = umartLike('Umart', 'www.umart.com.au');
export const msy = umartLike('MSY', 'www.msy.com.au');
