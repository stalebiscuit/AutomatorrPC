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
 * Per-merchant single-store totals with a difference-vs-cheapest column
 * (the PCPP "Prices By Merchant" view). A merchant that doesn't carry a part
 * falls back to that part's cheapest quote for the total, but is marked as
 * carrying fewer parts via availableCount.
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
      const fallback = bestPrice(component);
      const price = at ?? fallback;
      if (at !== null) availableCount += 1;
      if (price !== null) total += price;
      items.push({ category, slug: component.slug, name: component.name, price: at });
    }
    rows.push({
      store,
      availableCount,
      totalParts,
      total: Math.round(total * 100) / 100,
      difference: 0,
      items,
    });
  }

  rows.sort((a, b) => a.total - b.total);
  const cheapest = rows.length ? rows[0]!.total : 0;
  for (const r of rows) r.difference = Math.round((r.total - cheapest) * 100) / 100;
  return rows;
}
