import * as cheerio from 'cheerio';
import type { Component } from '@automatorr/shared';

/** A single AU-retailer adapter (spec §12). Small, pure, fixture-testable. */
export interface RetailerAdapter {
  readonly store: string;
  readonly domain: string;
  /** absolute URL to search/scrape for this component */
  buildSearchUrl(component: Component): string;
  /** extract a price (AUD) from fetched HTML, or null if not found */
  parse(html: string, component: Component): { price: number; url: string } | null;
  /** DB-4 Tier 2: extract the first result's product image URL from the same HTML, or null */
  parseImage?(html: string, component: Component): string | null;
  /** Skip in the live price scrape (e.g. Cloudflare-gated Scorptec, or unimplemented stubs). Still
   *  listed for affiliate config. */
  readonly disabled?: boolean;
}

const PLACEHOLDER_IMG = /(no[-_]?image|placeholder|spacer|blank|loading|spinner|1x1|transparent|missing)/i;

/**
 * Extract the first product card's image URL from search HTML, absolute-ized.
 * Handles lazy-load attributes (srcset / data-src / data-original / data-lazy) and
 * rejects inline-data URIs and obvious placeholder/spinner assets. Returns null when
 * nothing usable is found — the UI then shows the Tier-1 category placeholder.
 */
export function firstCardImage(html: string, selector: string, base: string): string | null {
  const $ = cheerio.load(html);
  let img = $(selector).first();
  if (img.length === 0) return null;
  if (!img.is('img')) img = img.find('img').first();
  if (img.length === 0) return null;
  const fromSrcset = (img.attr('srcset') ?? img.attr('data-srcset'))?.split(',').pop()?.trim().split(/\s+/)[0];
  const raw =
    fromSrcset ||
    img.attr('data-src') ||
    img.attr('data-original') ||
    img.attr('data-lazy') ||
    img.attr('data-image') ||
    img.attr('src');
  if (!raw) return null;
  const candidate = raw.trim();
  if (!candidate || candidate.startsWith('data:') || PLACEHOLDER_IMG.test(candidate)) return null;
  try {
    const abs = new URL(candidate, base).toString();
    return /^https?:\/\//i.test(abs) ? abs : null;
  } catch {
    return null;
  }
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

/** Text content of the first matching element — used to verify a result matches the query. */
export function firstCardText(html: string, selector: string): string {
  const $ = cheerio.load(html);
  return $(selector).first().text().replace(/\s+/g, ' ').trim();
}

const MATCH_STOP = new Set(['the', 'for', 'with', 'and', 'oc', 'edition', 'gaming']);
/**
 * Does a search result's card text plausibly match the queried component? Guards against
 * grabbing a sibling product's image when a store lacks the exact part. If the component name
 * has a model code (letter+digit token), that must appear; otherwise ≥60% of key tokens must.
 */
export function titleMatches(componentName: string, cardText: string): boolean {
  if (!cardText) return false;
  const hay = cardText.toLowerCase();
  const toks = componentName.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !MATCH_STOP.has(t));
  if (!toks.length) return true;
  const models = toks.filter((t) => /[a-z]/.test(t) && /[0-9]/.test(t));
  if (models.length) return models.some((m) => hay.includes(m));
  const hits = toks.filter((t) => hay.includes(t)).length;
  return hits / toks.length >= 0.6;
}
