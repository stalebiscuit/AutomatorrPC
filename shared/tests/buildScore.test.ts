import { describe, it, expect } from 'vitest';
import { scoreBuild } from '../src/buildScore.js';
import { mkComponent, build, goodBuild, price } from './fixtures.js';

describe('buildScore (spec §8)', () => {
  it('scores an empty build at 0 (nothing selected → not 80)', () => {
    const r = scoreBuild([]);
    expect(r.score).toBe(0);
    expect(r.breakdown.compatibility).toBe(0);
  });

  it('rises as the build gets more complete', () => {
    const cpuOnly = scoreBuild(build(['cpu', mkComponent('cpu', { socket: 'AM5', igpu: 'None' })])).score;
    const full = scoreBuild(goodBuild()).score;
    expect(cpuOnly).toBeGreaterThan(0);
    expect(cpuOnly).toBeLessThan(full);
  });

  it('scores a complete, compatible, on-budget build highly', () => {
    const r = scoreBuild(goodBuild(), { budget: 1800 });
    expect(r.score).toBeGreaterThan(80);
    expect(r.breakdown.compatibility).toBe(40);
  });

  it('caps the score at 40 when there is a HARD incompatibility', () => {
    const cpu = mkComponent('cpu', { socket: 'AM5', tdp: 65, igpu: 'None' });
    const mobo = mkComponent('motherboard', { socket: 'LGA1700', ramType: 'DDR5', ramSlots: 4, formFactor: 'ATX' });
    const r = scoreBuild(build(['cpu', cpu], ['motherboard', mobo]));
    expect(r.score).toBeLessThanOrEqual(40);
    expect(r.breakdown.compatibility).toBe(0);
  });

  it('penalises going over budget', () => {
    const under = scoreBuild(goodBuild(), { budget: 1800 }).score;
    const over = scoreBuild(goodBuild(), { budget: 800 }).score;
    expect(over).toBeLessThan(under);
    expect(scoreBuild(goodBuild(), { budget: 800 }).notes.join(' ')).toMatch(/over budget/i);
  });

  it('penalises missing essential parts', () => {
    const full = scoreBuild(goodBuild()).score;
    const partial = scoreBuild(build(['cpu', mkComponent('cpu', { socket: 'AM5', igpu: 'None' })])).score;
    expect(partial).toBeLessThan(full);
  });
});

describe('buildScore — golden values (regression: lock the weighting)', () => {
  it('a complete, compatible, in-budget build scores as expected', () => {
    const g = goodBuild();
    // No budget → full budget-fit credit.
    expect(scoreBuild(g).score).toBe(100);
    // With a comfortable budget the total (≈$1730) sits under $2000.
    const withBudget = scoreBuild(g, { budget: 2000 });
    expect(withBudget.score).toBe(99);
    expect(withBudget.breakdown).toEqual({ compatibility: 40, budgetFit: 24, completeness: 20, balance: 15 });
  });

  it('penalises an over-budget build proportionally', () => {
    const r = scoreBuild(goodBuild(), { budget: 1500 });
    expect(r.score).toBe(92);
    expect(r.notes.some((n) => n.includes('Over budget'))).toBe(true);
  });

  it('caps a build with a hard incompatibility', () => {
    const cpu = mkComponent('cpu', { socket: 'AM5', tdp: 65, igpu: 'None' }, { prices: [price('M', 300)] });
    const cooler = mkComponent('cooler', { type: 'air', height: 150, socketSupport: 'LGA1700' }, { prices: [price('M', 60)] });
    const r = scoreBuild(build(['cpu', cpu], ['cooler', cooler]), { budget: 2000 });
    expect(r.breakdown.compatibility).toBe(0);
    expect(r.score).toBeLessThanOrEqual(40);
  });

  it('scores an empty build at 0', () => {
    expect(scoreBuild([]).score).toBe(0);
  });
});
