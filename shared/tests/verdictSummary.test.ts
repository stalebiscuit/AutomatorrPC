import { describe, it, expect } from 'vitest';
import { summarizeVerdict, trimBrand } from '../src/verdictSummary.js';
import type { CompareResult, CompareRow } from '../src/types.js';

function row(key: string, label: string, va: number, vb: number, lead: 'a' | 'b', counted = true): CompareRow {
  return {
    key, label, valueA: va, valueB: vb, displayA: String(va), displayB: String(vb),
    lead, counted, direction: 'higher',
  };
}

function result(overrides: Partial<CompareResult> = {}): CompareResult {
  const a = { slug: 'ryzen-7-7800x3d', name: 'AMD Ryzen 7 7800X3D', prices: [] } as never;
  const b = { slug: 'core-i9-14900k', name: 'Intel Core i9-14900K', prices: [] } as never;
  return {
    category: 'cpu',
    a, b,
    rows: [
      row('l3Cache', 'L3 cache', 96, 36, 'a'),
      row('tdp', 'TDP', 120, 253, 'a'),
      row('performanceIndex', 'Performance index', 105, 98, 'a'),
      row('boostClock', 'Boost clock', 5.0, 6.0, 'b'),
      row('threads', 'Threads', 16, 32, 'b'),
    ],
    scorecard: {
      winnerSlug: 'ryzen-7-7800x3d', loserSlug: 'core-i9-14900k',
      tally: { a: 3, b: 2, total: 5 }, deltas: [], tags: [], crossSubtype: false,
    },
    ...overrides,
  } as CompareResult;
}

describe('summarizeVerdict (deterministic explanation, replaces AI verdict)', () => {
  it('states the win margin and the winner’s leading specs', () => {
    const s = summarizeVerdict(result());
    expect(s).toContain('Ryzen 7 7800X3D wins 3 of 5 measured categories');
    expect(s).toMatch(/leading on/);
    // Most decisive advantage (largest RELATIVE gap) surfaces first:
    // l3 cache 96 vs 36 = 1.67x gap beats tdp 120 vs 253 = 1.11x.
    expect(s).toContain('leading on l3 cache');
  });

  it('mentions where the loser pulls ahead', () => {
    const s = summarizeVerdict(result());
    expect(s).toContain('The Core i9-14900K only pulls ahead on');
    expect(s).toMatch(/threads|boost clock/);
  });

  it('is deterministic', () => {
    expect(summarizeVerdict(result())).toBe(summarizeVerdict(result()));
  });

  it('handles a clean sweep with no loser advantages', () => {
    const r = result();
    r.rows = r.rows.map((x) => ({ ...x, lead: 'a' as const }));
    r.scorecard.tally = { a: 5, b: 0, total: 5 };
    const s = summarizeVerdict(r);
    expect(s).not.toContain('pulls ahead');
    expect(s).toContain('wins 5 of 5');
  });

  it('trimBrand drops a leading brand word', () => {
    expect(trimBrand('Intel Core i9-14900K')).toBe('Core i9-14900K');
    expect(trimBrand('Noctua NH-D15')).toBe('NH-D15');
  });
});
