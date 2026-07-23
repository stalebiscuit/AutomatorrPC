import type { Component } from '@automatorr/shared';
import { type RetailerAdapter, searchQuery, titleMatches } from './types.js';

/**
 * PCCaseGear price adapter via its public Algolia search API — JSON directly, no Playwright
 * render (~sub-second vs ~5-7s; full scrape without --render). Config is PCCaseGear's PUBLIC,
 * search-only Algolia setup (the same values their storefront ships to every browser). Search-
 * only keys can only query, not write. Captured 2026-07 from the header instant-search request.
 *
 * Single-index GET search: GET /1/indexes/{index}?query=…&x-algolia-application-id=…&x-algolia-api-key=…
 * returns { hits: [...] } directly. Fields (from a sample hit): products_name, products_price
 * (number, GST-inclusive — NOT gtmProducts.price which is ex-GST), Product_URL (relative), Image_URL.
 */
const APP_ID = 'HPD3DBJ2IO';
const API_KEY = '9559cf1a6c7521a30ba0832ec6c38499'; // public search-only key
const INDEX = 'pccg_products';
const HOST = `${APP_ID.toLowerCase()}-dsn.algolia.net`;

interface Hit { products_name?: string; products_price?: number | string; Product_URL?: string; Image_URL?: string }

export const pccasegearAlgolia: RetailerAdapter = {
  store: 'PCCaseGear',
  domain: HOST,

  buildSearchUrl(c: Component): string {
    const params = new URLSearchParams({
      query: searchQuery(c),
      hitsPerPage: '20',
      'x-algolia-application-id': APP_ID,
      'x-algolia-api-key': API_KEY,
    });
    return `https://${HOST}/1/indexes/${INDEX}?${params.toString()}`;
  },

  parse(body: string, c: Component) {
    let hits: Hit[];
    try {
      hits = (JSON.parse(body) as { hits?: Hit[] }).hits ?? [];
    } catch {
      return null;
    }
    const hit = hits.find((h) => titleMatches(c.name, String(h.products_name ?? '')));
    if (!hit) return null;
    const price = typeof hit.products_price === 'number' ? hit.products_price : Number(String(hit.products_price ?? '').replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(price) || price <= 0) return null;
    const path = String(hit.Product_URL ?? '');
    if (!path) return null;
    const url = path.startsWith('http') ? path : `https://www.pccasegear.com${path}`;
    return { price, url };
  },

  parseImage(body: string, c: Component) {
    let hits: Hit[];
    try {
      hits = (JSON.parse(body) as { hits?: Hit[] }).hits ?? [];
    } catch {
      return null;
    }
    const hit = hits.find((h) => titleMatches(c.name, String(h.products_name ?? '')));
    const img = hit?.Image_URL ? String(hit.Image_URL) : '';
    if (!img) return null;
    return img.replace(/-thumbx?(\.[a-z]+)$/i, '$1'); // strip the -thumb/-thumbx suffix → full image
  },
};
