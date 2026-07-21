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

  it('a store missing parts totals only what it stocks and is not a one-store option', () => {
    const b = build(
      ['cpu', mkComponent('cpu', {}, { prices: [price('A', 300), price('B', 320)] })],
      ['gpu', mkComponent('gpu', {}, { prices: [price('A', 600)] })], // only A stocks the GPU
    );
    const rows = pricesByMerchant(b);
    const A = rows.find((r) => r.store === 'A')!;
    const B = rows.find((r) => r.store === 'B')!;
    // A stocks both parts -> complete, real total 900, cheapest complete store
    expect(A.complete).toBe(true);
    expect(A.total).toBe(900);
    expect(A.difference).toBe(0);
    // B stocks only the CPU -> total is just its own CPU price (no back-fill), incomplete, no rank
    expect(B.availableCount).toBe(1);
    expect(B.complete).toBe(false);
    expect(B.total).toBe(320);
    expect(B.difference).toBeNull();
    // the complete store sorts above the partial one
    expect(rows[0]!.store).toBe('A');
  });
});
