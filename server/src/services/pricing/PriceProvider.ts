import type { Component, PriceQuote } from '@automatorr/shared';
import { loadConfig } from '../../config.js';

/** The stable pricing contract (spec §12). Future providers implement this. */
export interface PriceProvider {
  readonly name: string;
  getPrices(component: Component): Promise<PriceQuote[]>;
}

/** Fetch abstraction so the scraper can be driven by fixtures in tests. */
export interface Fetcher {
  (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }): Promise<{
    ok: boolean;
    status: number;
    text(): Promise<string>;
  }>;
}

let cached: PriceProvider | null = null;

/** Factory — selects the provider from PRICE_PROVIDER (spec §12, §13). */
export async function getPriceProvider(): Promise<PriceProvider> {
  if (cached) return cached;
  const which = loadConfig().PRICE_PROVIDER;
  switch (which) {
    case 'scraper':
    default: {
      const { ScraperPriceProvider } = await import('./ScraperPriceProvider.js');
      cached = new ScraperPriceProvider();
      break;
    }
  }
  return cached;
}

export function setPriceProviderForTests(provider: PriceProvider | null): void {
  cached = provider;
}
