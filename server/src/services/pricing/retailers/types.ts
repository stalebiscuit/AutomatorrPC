import type { Component } from '@automatorr/shared';

/** A single AU-retailer adapter (spec §12). Small, pure, fixture-testable. */
export interface RetailerAdapter {
  readonly store: string;
  readonly domain: string;
  /** absolute URL to search/scrape for this component */
  buildSearchUrl(component: Component): string;
  /** extract a price (AUD) from fetched HTML, or null if not found */
  parse(html: string, component: Component): { price: number; url: string } | null;
}

/** A search query string for a component (brand + model usually suffices). */
export function searchQuery(c: Component): string {
  return c.name.replace(/\s+/g, ' ').trim();
}

/** Parse the first plausible AUD price from a chunk of text. */
export function parseAud(text: string): number | null {
  const m = text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  if (!m || !m[1]) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}
