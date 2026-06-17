import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Component, PriceQuote } from '@automatorr/shared';
import { startMemoryDb, stopMemoryDb, clearCollections } from './helpers/memoryDb.js';
import { seedDatabase } from '../src/seed/seed.js';
import { ComponentModel } from '../src/models/index.js';
import { refreshAllPrices } from '../src/services/pricing/refreshPrices.js';
import { buildRollups } from '../src/services/analytics.js';
import type { PriceProvider } from '../src/services/pricing/PriceProvider.js';

describe('Phase 9 — fail-soft jobs', () => {
  beforeAll(async () => {
    await startMemoryDb();
    await clearCollections();
    await seedDatabase();
  });
  afterAll(async () => {
    await stopMemoryDb();
  });

  it('refreshAllPrices keeps last-known when a provider throws (never crashes)', async () => {
    // Pre-seed one component with a known price.
    const known: PriceQuote = {
      store: 'Scorptec',
      price: 499,
      currency: 'AUD',
      url: 'https://www.scorptec.com.au/x',
      lastUpdated: new Date().toISOString(),
    };
    await ComponentModel.updateOne(
      { category: 'cpu', slug: 'intel-core-i9-14900k' },
      { $set: { prices: [{ ...known, lastUpdated: new Date() }] } },
    );

    const throwing: PriceProvider = {
      name: 'boom',
      getPrices: async (_c: Component) => {
        throw new Error('provider exploded');
      },
    };

    const result = await refreshAllPrices(throwing);
    expect(result.updated).toBe(0);
    expect(result.keptLastKnown).toBe(result.scanned);

    const doc = await ComponentModel.findOne({ category: 'cpu', slug: 'intel-core-i9-14900k' });
    expect(doc?.prices[0]?.price).toBe(499); // last-known preserved
  });

  it('buildRollups runs without throwing on a fresh dataset', async () => {
    await expect(buildRollups()).resolves.toBeUndefined();
  });
});
