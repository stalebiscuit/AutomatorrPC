import { describe, it, expect } from 'vitest';
import { bestPrice, buildTotal, pricesByMerchant } from '../src/pricing.js';
import { mkComponent, price, build } from './fixtures.js';

describe('pricing', () => {
  it('bestPrice picks the lowest quote, null when unpriced', () => {
    expect(bestPrice(mkComponent('cpu', {}, { prices: [price('A', 300), price('B', 250)] }))).toBe(250);
    expect(bestPrice(mkComponent('cpu', {}, { prices: [] }))).toBeNull();
  });

  it('buildTotal sums the cheapest quote per part', () => {
    const b = build(
      ['cpu', mkComponent('cpu', {}, { prices: [price('A', 300), price('B', 280)] })],
      ['gpu', mkComponent('gpu', {}, { prices: [price('A', 600)] })],
    );
    expect(buildTotal(b)).toBe(880);
  });

  it('pricesByMerchant ranks stores and computes difference vs cheapest', () => {
    const b = build(
      ['cpu', mkComponent('cpu', {}, { prices: [price('A', 300), price('B', 320)] })],
      ['gpu', mkComponent('gpu', {}, { prices: [price('A', 600), price('B', 590)] })],
    );
    const rows = pricesByMerchant(b);
    expect(rows[0]!.difference).toBe(0);
    expect(rows[0]!.total).toBeLessThanOrEqual(rows[1]!.total);
    // Store A = 300+600=900, Store B = 320+590=910 → A cheapest
    expect(rows[0]!.store).toBe('A');
    expect(rows[1]!.difference).toBe(10);
  });
});
