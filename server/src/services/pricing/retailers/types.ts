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

// Filler words that never distinguish one SKU from another.
const FILLER = new Set([
  'the', 'for', 'with', 'and', 'edition', 'gaming', 'graphics', 'card', 'video',
  'desktop', 'series', 'new', 'genuine', 'ready', 'brand', 'powered', 'aus', 'au',
]);
// Memory-type tokens look like model codes but retailers often omit them — soft-match only.
const MEMTYPE = new Set([
  'gddr7', 'gddr6', 'gddr6x', 'gddr5', 'gddr5x', 'ddr5', 'ddr4', 'ddr3', 'ddr3l', 'hbm2', 'hbm3',
]);
// SKU-distinguishing qualifiers: a mismatch here means a DIFFERENT product.
const VARIANT = new Set(['oc', 'ti', 'super', 'xt', 'xtx', 'btf', 'lc', 'fe', 'wifi']);

/** Lowercase, glue space-separated capacities ("32 GB" → "32gb"), then split to tokens. */
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/(\d)\s+(gb|tb|mb)\b/g, '$1$2')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** A token that pins the exact SKU: a pure number ≥3 digits (5090, 6000) or an
 *  alphanumeric model/capacity (9800x3d, b650e, 32gb) — excluding memory types. */
function isHardModel(t: string): boolean {
  if (MEMTYPE.has(t)) return false;
  if (/^\d{3,}$/.test(t)) return true;
  return /[a-z]/.test(t) && /\d/.test(t) && t.length >= 4;
}

function setEq(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

/**
 * Does a search result's title refer to the SAME product SKU as the component?
 * Strict by design — a wrong-but-cheap match sends users to the wrong product,
 * so we prefer returning no price over a mismatch:
 *   1. every hard model/capacity token in the component must appear (exact token,
 *      so 14900K ≠ 14900KF and 16GB ≠ 32GB);
 *   2. variant qualifiers (OC/Ti/Super/XT/XTX/BTF/LC/FE/WiFi) must match
 *      symmetrically — "Astral OC" never matches "Astral BTF OC";
 *   3. for multi-word names, ≥60% of the remaining line tokens must appear, so a
 *      same-chip card from a different brand/product line is rejected.
 */
export function titleMatches(componentName: string, cardText: string): boolean {
  if (!cardText) return false;
  const comp = tokenize(componentName);
  if (!comp.length) return true;
  const card = tokenize(cardText);
  const cardSet = new Set(card);

  // 1) hard model/capacity tokens must all be present (exact token match)
  for (const t of comp) {
    if (isHardModel(t) && !cardSet.has(t)) return false;
  }
  // 2) symmetric variant qualifiers
  const compVar = new Set(comp.filter((t) => VARIANT.has(t)));
  const cardVar = new Set(card.filter((t) => VARIANT.has(t)));
  if (!setEq(compVar, cardVar)) return false;

  // 3) product-line overlap (skip very short names — the model token already pins it)
  const sig = comp.filter(
    (t) => t.length >= 3 && !FILLER.has(t) && !VARIANT.has(t) && !isHardModel(t),
  );
  if (sig.length < 3) return true;
  const hits = sig.filter((t) => cardSet.has(t)).length;
  return hits / sig.length >= 0.6;
}
