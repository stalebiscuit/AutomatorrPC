/**
 * Listing → canonical-part matcher (Task 3 §5). Maps a retailer listing onto a
 * catalogue part: exact canonical key, else fuzzy Dice similarity gated by brand,
 * else an alias override, else none (→ manual review). Pure + testable.
 */
import { canonicalKey, normalizeBrand, modelTokens } from './canonical.js';

export interface CanonicalCandidate {
  category: string;
  brand: string;
  name: string;
  slug: string;
}

export interface Listing {
  category: string;
  brand: string;
  name: string;
  store?: string;
  /** outbound listing URL (carried into the review queue) */
  url?: string;
  /** quoted price (carried into the review queue) */
  price?: number;
}

export type MatchMethod = 'exact' | 'fuzzy' | 'alias' | 'none';

export interface MatchResult {
  slug: string | null;
  method: MatchMethod;
  /** 1 for exact/alias; Dice similarity (0–1) for fuzzy/none */
  score: number;
}

export interface MatchOptions {
  /** minimum Dice score to auto-accept a fuzzy match (default 0.8) */
  threshold?: number;
  /** confirmed overrides: canonicalKey(listing) → canonical slug */
  aliases?: Record<string, string>;
}

/** Dice coefficient over two token sets: 2|A∩B| / (|A|+|B|). */
export function diceSimilarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter += 1;
  return (2 * inter) / (setA.size + setB.size);
}

export function matchListing(
  listing: Listing,
  candidates: CanonicalCandidate[],
  opts: MatchOptions = {},
): MatchResult {
  const threshold = opts.threshold ?? 0.8;
  const key = canonicalKey(listing.brand, listing.name, listing.category);

  // 1. Alias override (confirmed match/miss resolution).
  const alias = opts.aliases?.[key];
  if (alias) return { slug: alias, method: 'alias', score: 1 };

  // 2. Exact canonical-key match.
  for (const c of candidates) {
    if (c.category === listing.category && canonicalKey(c.brand, c.name, c.category) === key) {
      return { slug: c.slug, method: 'exact', score: 1 };
    }
  }

  // 3. Fuzzy within the same category + same normalized brand.
  const nb = normalizeBrand(listing.brand);
  const lTokens = modelTokens(listing.name, listing.brand);
  let best: { slug: string; score: number } | null = null;
  for (const c of candidates) {
    if (c.category !== listing.category) continue;
    if (normalizeBrand(c.brand) !== nb) continue;
    const score = diceSimilarity(lTokens, modelTokens(c.name, c.brand));
    if (!best || score > best.score) best = { slug: c.slug, score };
  }

  if (best && best.score >= threshold) return { slug: best.slug, method: 'fuzzy', score: best.score };
  return { slug: null, method: 'none', score: best?.score ?? 0 };
}
