import { describe, it, expect } from 'vitest';
import type { Component, CompareCategory, PriceQuote, Specs } from '@automatorr/shared';
import { compare } from '../src/services/compare.js';

function comp(
  category: CompareCategory,
  slug: string,
  performanceIndex: number,
  specs: Specs,
  prices: PriceQuote[] = [],
): Component {
  return {
    id: slug,
    category,
    brand: 'X',
    name: slug,
    slug,
    imageUrl: null,
    specs,
    benchmark: { ubRaw: performanceIndex, ubSource: 'test' },
    performanceIndex,
    prices,
    provenance: { specSourceUrl: 'https://example.com', seededAt: '2026-01-01T00:00:00Z', unknownFields: [] },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

const price = (store: string, p: number): PriceQuote => ({
  store,
  price: p,
  currency: 'AUD',
  url: 'https://example.com',
  lastUpdated: '2026-01-01T00:00:00Z',
});

describe('compare() — CPU flagship (UB-faithful: Intel wins)', () => {
  const intel = comp(
    'cpu',
    'intel-core-i9-14900k',
    1074,
    { cores: 24, threads: 32, baseClock: 3.2, boostClock: 6.0, l3Cache: 36, tdp: 125, socket: 'LGA 1700', igpu: 'UHD 770' },
    [price('Amazon', 549)],
  );
  const amd = comp(
    'cpu',
    'amd-ryzen-7-7800x3d',
    992,
    { cores: 8, threads: 16, baseClock: 4.2, boostClock: 5.0, l3Cache: 96, tdp: 120, socket: 'AM5', igpu: 'Radeon' },
    [price('Amazon', 359)],
  );

  it('declares Intel the winner by performanceIndex', () => {
    const { scorecard } = compare(intel, amd);
    expect(scorecard.winnerSlug).toBe('intel-core-i9-14900k');
    expect(scorecard.loserSlug).toBe('amd-ryzen-7-7800x3d');
    expect(scorecard.crossSubtype).toBe(false);
  });

  it('sets per-row Lead flags by direction', () => {
    const { rows } = compare(intel, amd);
    const byKey = new Map(rows.map((r) => [r.key, r]));
    expect(byKey.get('performanceIndex')?.lead).toBe('a');
    expect(byKey.get('boostClock')?.lead).toBe('a'); // 6.0 > 5.0
    expect(byKey.get('l3Cache')?.lead).toBe('b'); // 96 > 36
    expect(byKey.get('tdp')?.lead).toBe('b'); // lower wins → 120 < 125
    expect(byKey.get('price')?.lead).toBe('b'); // cheaper wins
    expect(byKey.get('socket')?.lead).toBe('none'); // info row
    expect(byKey.get('socket')?.counted).toBe(false);
  });

  it('tallies decided counted categories only', () => {
    const { scorecard } = compare(intel, amd);
    // a: perf, cores, threads, boost = 4 ; b: base, l3, tdp, price = 4
    expect(scorecard.tally).toEqual({ a: 4, b: 4, total: 8 });
  });

  it('builds up to 4 signed decisive deltas from the winner POV', () => {
    const { scorecard } = compare(intel, amd);
    const labels = scorecard.deltas.map((d) => d.label);
    expect(labels).toEqual(['PERFORMANCE', 'CACHE', 'POWER', 'PRICE']);
    expect(scorecard.deltas[0]?.value.startsWith('+')).toBe(true); // perf higher
    const price = scorecard.deltas.find((d) => d.label === 'PRICE');
    expect(price?.value).toContain('$190'); // 549 - 359
  });

  it('derives tags the winner actually earns', () => {
    const { scorecard } = compare(intel, amd);
    // Intel leads performanceIndex → Gaming; not cheaper, not lower power.
    expect(scorecard.tags).toContain('Gaming');
    expect(scorecard.tags).not.toContain('Value');
    expect(scorecard.tags).not.toContain('Efficiency');
  });
});

describe('compare() — storage cross-subtype (SSD vs HDD)', () => {
  const ssd = comp(
    'storage',
    'samsung-990-pro-2tb',
    1000,
    { subtype: 'ssd', capacity: 2000, seqRead: 7450, seqWrite: 6900, interface: 'NVMe PCIe 4.0', formFactor: 'M.2 2280', tbw: 1200, randomIOPS: 1400000, dram: 'Yes', nandType: 'TLC' },
    [price('PLE', 300)],
  );
  const hdd = comp(
    'storage',
    'seagate-barracuda-2tb',
    214,
    { subtype: 'hdd', capacity: 2000, seqRead: 220, seqWrite: 220, interface: 'SATA III', formFactor: '3.5"', rpm: 7200, cacheMB: 256 },
    [price('Scorptec', 80)],
  );

  it('flags crossSubtype and SSD wins by index', () => {
    const { scorecard } = compare(ssd, hdd);
    expect(scorecard.crossSubtype).toBe(true);
    expect(scorecard.winnerSlug).toBe('samsung-990-pro-2tb');
  });

  it('counts only the Common group in the tally', () => {
    const { scorecard, rows } = compare(ssd, hdd);
    // Common decided: perf(a), seqRead(a), seqWrite(a) ; price(b), pricePerTB(b). capacity ties.
    expect(scorecard.tally).toEqual({ a: 3, b: 2, total: 5 });
    // subtype-unique fields render but never count
    const tbw = rows.find((r) => r.key === 'tbw');
    const rpm = rows.find((r) => r.key === 'rpm');
    expect(tbw?.counted).toBe(false);
    expect(tbw?.displayB).toBe('—'); // HDD lacks TBW
    expect(rpm?.counted).toBe(false);
    expect(rpm?.displayA).toBe('—'); // SSD lacks RPM
  });

  it('reads honestly: SSD wins Speed, HDD wins value-per-TB', () => {
    const { scorecard, rows } = compare(ssd, hdd);
    expect(scorecard.tags).toContain('Speed');
    expect(rows.find((r) => r.key === 'pricePerTB')?.lead).toBe('b'); // HDD cheaper per TB
  });
});

describe('compare() — edge cases', () => {
  it('handles a perfect tie (stable winner, empty deltas)', () => {
    const specs = { cores: 8, threads: 16, baseClock: 4, boostClock: 5, l3Cache: 32, tdp: 100, socket: 'AM5', igpu: 'x' };
    const a = comp('cpu', 'a', 1000, specs, [price('S', 200)]);
    const b = comp('cpu', 'b', 1000, specs, [price('S', 200)]);
    const { scorecard } = compare(a, b);
    expect(scorecard.winnerSlug).toBe('a');
    expect(scorecard.tally).toEqual({ a: 0, b: 0, total: 0 });
    expect(scorecard.deltas).toHaveLength(0);
  });

  it('renders missing specs as — and does not count them', () => {
    const a = comp('cpu', 'a', 1000, { cores: 8, threads: 16, boostClock: 5, l3Cache: 32, tdp: 100 });
    const b = comp('cpu', 'b', 900, { cores: 6, threads: 12, boostClock: 5, l3Cache: 32, tdp: 100 });
    const { rows } = compare(a, b);
    const base = rows.find((r) => r.key === 'baseClock');
    expect(base?.displayA).toBe('—');
    expect(base?.lead).toBe('none');
  });

  it('tie-breaks equal index by lower best price', () => {
    const specs = { cores: 8, threads: 16, boostClock: 5, l3Cache: 32, tdp: 100 };
    const a = comp('cpu', 'a', 1000, specs, [price('S', 400)]);
    const b = comp('cpu', 'b', 1000, specs, [price('S', 300)]);
    expect(compare(a, b).scorecard.winnerSlug).toBe('b');
  });
});

describe('compare — non-benchmarked categories (cooler/case/psu/monitor)', () => {
  it('decides a cooler winner by counted spec fields, not the (absent) index', () => {
    // Both have performanceIndex 0; A leads cooling + noise → A should win.
    const a = comp('cooler', 'cool-a', 0, { type: 'aio', tdpRating: 300, noiseDb: 20, socketSupport: 'AM5,LGA1700' }, [price('Mwave', 160)]);
    const b = comp('cooler', 'cool-b', 0, { type: 'air', tdpRating: 220, noiseDb: 28, socketSupport: 'AM5,LGA1700' }, [price('Mwave', 90)]);
    const r = compare(a, b);
    expect(r.category).toBe('cooler');
    expect(r.scorecard.winnerSlug).toBe('cool-a');
    expect(r.scorecard.tally.a).toBeGreaterThan(r.scorecard.tally.b);
    // No performance-index row for a non-benchmarked category.
    expect(r.rows.some((row) => row.key === 'performanceIndex')).toBe(false);
  });

  it('compares monitors on refresh + size', () => {
    const a = comp('monitor', 'mon-a', 0, { resolution: '2560x1440', refreshHz: 240, size: 27, panelType: 'IPS' }, [price('Mwave', 400)]);
    const b = comp('monitor', 'mon-b', 0, { resolution: '1920x1080', refreshHz: 165, size: 24, panelType: 'VA' }, [price('Mwave', 250)]);
    const r = compare(a, b);
    expect(r.scorecard.winnerSlug).toBe('mon-a');
    expect(r.scorecard.tags).toContain('High refresh');
  });
});
