/**
 * Pure pricing helpers shared by client, server and the AI agent.
 * Prices live on each Component as PriceQuote[]; the builder shows the cheapest
 * in-stock quote per part and a per-merchant single-store total (spec §7.2).
 */
import type { Component, ResolvedBuild, ResolvedBuildPart, MerchantTotal, MerchantLineItem } from './types.js';

/** Lowest quoted price across a component's merchants (null when unpriced). */
export function bestPrice(c: Component): number | null {
  if (!c.prices.length) return null;
  return Math.min(...c.prices.map((p) => p.price));
}

/** Price of a component at a specific store (null when that store has no quote). */
export function priceAtStore(c: Component, store: string): number | null {
  const q = c.prices.find((p) => p.store === store);
  return q ? q.price : null;
}

/** Price of a part honouring its chosen merchant, else the cheapest quote. */
export function effectivePrice(part: ResolvedBuildPart): number | null {
  if (part.chosenStore) {
    const at = priceAtStore(part.component, part.chosenStore);
    if (at !== null) return at;
  }
  return bestPrice(part.component);
}

/** Running build total = sum of each part's effective price (unpriced parts skipped). */
export function buildTotal(build: ResolvedBuild): number {
  let total = 0;
  for (const part of build) {
    const p = effectivePrice(part);
    if (p !== null) total += p;
  }
  return Math.round(total * 100) / 100;
}

/**
 * Per-merchant totals for the "Prices By Merchant" view. Each row is the cost of the parts
 * THAT store actually stocks — its own quotes only, never back-filled from other stores, so a
 * store carrying one part no longer inherits the whole-build price. A store that stocks every
 * part is a real single-store checkout (`complete`); those are ranked against each other with a
 * difference-vs-cheapest. A store missing parts is not a one-store option, so difference = null.
 */
export function pricesByMerchant(build: ResolvedBuild): MerchantTotal[] {
  const stores = new Set<string>();
  for (const { component } of build) {
    for (const q of component.prices) stores.add(q.store);
  }
  const totalParts = build.filter((b) => bestPrice(b.component) !== null).length;

  const rows: MerchantTotal[] = [];
  for (const store of stores) {
    let total = 0;
    let availableCount = 0;
    const items: MerchantLineItem[] = [];
    for (const { category, component } of build) {
      const at = priceAtStore(component, store);
      if (at !== null) {
        availableCount += 1;
        total += at; // own quote only — do NOT back-fill missing parts from other stores
      }
      items.push({ category, slug: component.slug, name: component.name, price: at });
    }
    rows.push({
      store,
      availableCount,
      totalParts,
      total: Math.round(total * 100) / 100,
      complete: totalParts > 0 && availableCount === totalParts,
      difference: null,
      items,
    });
  }

  // Only stores that stock the WHOLE build are single-store options — rank those against each
  // other (cheapest complete store = 0, others = $ more). Partial stores keep difference = null.
  const complete = rows.filter((r) => r.complete).sort((a, b) => a.total - b.total);
  const cheapest = complete.length ? complete[0]!.total : null;
  for (const r of complete) r.difference = cheapest === null ? null : Math.round((r.total - cheapest) * 100) / 100;

  // Complete stores first (cheapest -> dearest), then partial stores by coverage, then price.
  rows.sort((a, b) => {
    if (a.complete !== b.complete) return a.complete ? -1 : 1;
    if (a.complete) return a.total - b.total;
    if (b.availableCount !== a.availableCount) return b.availableCount - a.availableCount;
    return a.total - b.total;
  });
  return rows;
}
