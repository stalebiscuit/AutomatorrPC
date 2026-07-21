import type { PriceProvider } from './PriceProvider.js';
import { ComponentModel } from '../../models/index.js';
import { serializeComponent } from '../../lib/serialize.js';
import { logger } from '../../lib/logger.js';

export interface RefreshResult {
  scanned: number;
  updated: number;
  keptLastKnown: number;
}

/**
 * Refresh `component.prices` for every component using the provider. On an empty
 * or failed scrape the last-known prices are kept (the UI shows `lastUpdated`).
 * Adapter failures are already isolated inside the provider, so this never
 * throws on a single retailer/component.
 */
export async function refreshAllPrices(provider: PriceProvider, opts?: { limit?: number }): Promise<RefreshResult> {
  const docs = await ComponentModel.find({}).limit(opts?.limit && opts.limit > 0 ? opts.limit : 0);
  let updated = 0;
  let keptLastKnown = 0;

  for (const doc of docs) {
    const component = serializeComponent(doc);
    let quotes;
    try {
      quotes = await provider.getPrices(component);
    } catch (err) {
      logger.warn(`getPrices failed for "${component.name}" — keeping last-known`, err);
      keptLastKnown++;
      continue;
    }
    if (quotes.length === 0) {
      keptLastKnown++;
      continue;
    }
    quotes.sort((a, b) => a.price - b.price); // lowest first
    doc.set(
      'prices',
      quotes.map((q) => ({ ...q, lastUpdated: new Date(q.lastUpdated) })),
    );
    await doc.save();
    updated++;
  }

  const result: RefreshResult = { scanned: docs.length, updated, keptLastKnown };
  logger.info(
    `Price refresh complete — scanned ${result.scanned}, updated ${result.updated}, kept last-known ${result.keptLastKnown}`,
  );
  return result;
}
