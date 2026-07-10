import type { Component } from '@automatorr/shared';
import { type RetailerAdapter, searchQuery } from './types.js';

/**
 * Stubbed adapters (spec §12 / Phase 4 task 2): registered but parse → null
 * until implemented. Amazon AU is intended to move to the PA-API provider seam
 * rather than HTML scraping (spec §14).
 */
export const amazonAu: RetailerAdapter = {
  store: 'Amazon',
  domain: 'www.amazon.com.au',
  buildSearchUrl(c: Component): string {
    return `https://www.amazon.com.au/s?k=${encodeURIComponent(searchQuery(c))}`;
  },
  parse(): null {
    return null; // TODO: move to AmazonPaapiProvider (spec §14)
  },
};

export const centreCom: RetailerAdapter = {
  store: 'Centre Com',
  domain: 'www.centrecom.com.au',
  buildSearchUrl(c: Component): string {
    return `https://www.centrecom.com.au/catalogsearch/result/?q=${encodeURIComponent(searchQuery(c))}`;
  },
  parse(): null {
    return null; // TODO: implement selector + fixture
  },
};
