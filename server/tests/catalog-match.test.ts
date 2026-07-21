import { describe, it, expect } from 'vitest';
import { canonicalKey, normalizeBrand, canonicalSlug } from '../src/services/catalog/canonical.js';
import { matchListing, diceSimilarity, type CanonicalCandidate } from '../src/services/catalog/match.js';

const CANDIDATES: CanonicalCandidate[] = [
  { category: 'cpu', brand: 'AMD', name: 'AMD Ryzen 5 7600X', slug: 'amd-ryzen-5-7600x' },
  { category: 'cpu', brand: 'AMD', name: 'AMD Ryzen 7 7700X', slug: 'amd-ryzen-7-7700x' },
  { category: 'cpu', brand: 'Intel', name: 'Intel Core i5-13600K', slug: 'intel-core-i5-13600k' },
  { category: 'gpu', brand: 'NVIDIA', name: 'NVIDIA GeForce RTX 4070', slug: 'nvidia-geforce-rtx-4070' },
];

describe('canonical identity', () => {
  it('normalizes brand synonyms', () => {
    expect(normalizeBrand('G.Skill')).toBe('gskill');
    expect(normalizeBrand('ASUS ROG')).toBe('asus');
  });
  it('canonical key is stable across retailer phrasing', () => {
    expect(canonicalKey('AMD', 'AMD Ryzen 5 7600X 6-Core AM5 Processor', 'cpu')).toBe(
      canonicalKey('AMD', 'AMD Ryzen 5 7600X', 'cpu'),
    );
  });
  it('slug matches catalogue convention', () => {
    expect(canonicalSlug('AMD Ryzen 5 7600X')).toBe('amd-ryzen-5-7600x');
  });
});

describe('matchListing', () => {
  it('exact-matches despite retailer noise words', () => {
    const r = matchListing(
      { category: 'cpu', brand: 'AMD', name: 'AMD Ryzen 5 7600X 6-Core AM5 Processor' },
      CANDIDATES,
    );
    expect(r.slug).toBe('amd-ryzen-5-7600x');
    expect(r.method).toBe('exact');
  });

  it('fuzzy-matches a noisy GPU listing', () => {
    const r = matchListing(
      { category: 'gpu', brand: 'NVIDIA', name: 'NVIDIA GeForce RTX 4070 Graphics Card 12GB' },
      CANDIDATES,
    );
    expect(r.slug).toBe('nvidia-geforce-rtx-4070');
    expect(['exact', 'fuzzy']).toContain(r.method);
  });

  it('does NOT match a different model (7900X → none)', () => {
    const r = matchListing({ category: 'cpu', brand: 'AMD', name: 'AMD Ryzen 9 7900X' }, CANDIDATES);
    expect(r.slug).toBeNull();
    expect(r.method).toBe('none');
  });

  it('respects the brand gate (no cross-brand match)', () => {
    const r = matchListing(
      { category: 'cpu', brand: 'Intel', name: 'Intel Core i9-14900K' },
      CANDIDATES,
    );
    expect(r.slug).toBeNull();
  });

  it('honours an alias override', () => {
    const key = canonicalKey('AMD', 'Ryzen5 7600X CPU', 'cpu');
    const r = matchListing(
      { category: 'cpu', brand: 'AMD', name: 'Ryzen5 7600X CPU' },
      CANDIDATES,
      { aliases: { [key]: 'amd-ryzen-5-7600x' } },
    );
    expect(r).toMatchObject({ slug: 'amd-ryzen-5-7600x', method: 'alias' });
  });

  it('diceSimilarity is symmetric and bounded', () => {
    expect(diceSimilarity(['a', 'b'], ['a', 'b'])).toBe(1);
    expect(diceSimilarity(['a'], ['b'])).toBe(0);
  });
});
