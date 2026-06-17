import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import type { Component } from '@automatorr/shared';
import { scorptec } from '../src/services/pricing/retailers/scorptec.js';
import { ple } from '../src/services/pricing/retailers/ple.js';
import { pccasegear } from '../src/services/pricing/retailers/pccasegear.js';
import { amazonAu, centreCom } from '../src/services/pricing/retailers/stubs.js';
import { ScraperPriceProvider } from '../src/services/pricing/ScraperPriceProvider.js';
import { clearRobotsCache } from '../src/services/pricing/robots.js';
import type { Fetcher } from '../src/services/pricing/PriceProvider.js';
import { refreshAllPrices } from '../src/services/pricing/refreshPrices.js';
import { createApp } from '../src/app.js';
import { startMemoryDb, stopMemoryDb, clearCollections } from './helpers/memoryDb.js';
import { seedDatabase } from '../src/seed/seed.js';

const FIX = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures');
const fixture = (f: string) => readFileSync(join(FIX, f), 'utf8');

const sample: Component = {
  id: 'x',
  category: 'cpu',
  brand: 'Intel',
  name: 'Intel Core i9-14900K',
  slug: 'intel-core-i9-14900k',
  imageUrl: null,
  specs: {},
  benchmark: { ubRaw: 131, ubSource: 't' },
  performanceIndex: 1074,
  prices: [],
  provenance: { specSourceUrl: 'https://e.com', seededAt: '2026-01-01T00:00:00Z', unknownFields: [] },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('Phase 4 — retailer adapters vs fixtures', () => {
  it('Scorptec parses the first card price', () => {
    expect(scorptec.parse(fixture('scorptec-search.html'), sample)?.price).toBe(549);
  });
  it('PLE parses the first card price', () => {
    expect(ple.parse(fixture('ple-search.html'), sample)?.price).toBe(559);
  });
  it('PCCaseGear parses the first card price', () => {
    expect(pccasegear.parse(fixture('pccasegear-search.html'), sample)?.price).toBe(569);
  });
  it('stubbed adapters return null', () => {
    expect(amazonAu.parse('', sample)).toBeNull();
    expect(centreCom.parse('', sample)).toBeNull();
  });
});

function makeFetcher(): Fetcher {
  const byHost: Record<string, string> = {
    'www.scorptec.com.au': fixture('scorptec-search.html'),
    'www.ple.com.au': fixture('ple-search.html'),
    'www.pccasegear.com': fixture('pccasegear-search.html'),
  };
  return async (url: string) => {
    const u = new URL(url);
    if (u.pathname === '/robots.txt') {
      return { ok: true, status: 200, text: async () => 'User-agent: *\nDisallow:' };
    }
    const html = byHost[u.hostname];
    if (html) return { ok: true, status: 200, text: async () => html };
    return { ok: false, status: 404, text: async () => '' };
  };
}

describe('Phase 4 — ScraperPriceProvider (fixture-driven)', () => {
  beforeAll(async () => {
    await startMemoryDb();
    await clearCollections();
    await seedDatabase();
  });
  afterAll(async () => {
    await stopMemoryDb();
  });

  it('collects quotes from implemented adapters and isolates the rest', async () => {
    clearRobotsCache();
    const provider = new ScraperPriceProvider({
      fetcher: makeFetcher(),
      perDomainDelayMs: 0,
      retries: 0,
    });
    const quotes = await provider.getPrices(sample);
    const stores = quotes.map((q) => q.store).sort();
    expect(stores).toEqual(['PCCaseGear', 'PLE Computers', 'Scorptec']);
    expect(quotes.every((q) => q.currency === 'AUD')).toBe(true);
  });

  it('respects robots.txt Disallow (skips a blocked retailer)', async () => {
    clearRobotsCache();
    const blocking: Fetcher = async (url) => {
      const u = new URL(url);
      if (u.hostname === 'www.scorptec.com.au' && u.pathname === '/robots.txt') {
        return { ok: true, status: 200, text: async () => 'User-agent: *\nDisallow: /search' };
      }
      return makeFetcher()(url);
    };
    const provider = new ScraperPriceProvider({ fetcher: blocking, perDomainDelayMs: 0, retries: 0 });
    const quotes = await provider.getPrices(sample);
    expect(quotes.map((q) => q.store)).not.toContain('Scorptec');
  });

  it('refreshAllPrices writes prices (lowest-first) and /api/compare returns them', async () => {
    clearRobotsCache();
    const provider = new ScraperPriceProvider({
      fetcher: makeFetcher(),
      perDomainDelayMs: 0,
      retries: 0,
    });
    const result = await refreshAllPrices(provider);
    expect(result.updated).toBeGreaterThan(0);

    const app = createApp();
    const res = await request(app).get(
      '/api/compare?category=cpu&a=intel-core-i9-14900k&b=amd-ryzen-7-7800x3d',
    );
    const cardA = res.body.a;
    expect(cardA.prices.length).toBeGreaterThan(0);
    // lowest-first ordering
    const prices = cardA.prices.map((p: { price: number }) => p.price);
    expect(prices).toEqual([...prices].sort((x, y) => x - y));
  });
});
