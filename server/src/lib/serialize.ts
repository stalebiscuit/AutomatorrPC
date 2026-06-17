import type { HydratedDocument } from 'mongoose';
import type { Component, PriceQuote } from '@automatorr/shared';
import type { ComponentDoc } from '../models/index.js';

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date().toISOString();
}

/** Convert a Mongoose Component document into the shared, JSON-safe Component. */
export function serializeComponent(doc: HydratedDocument<ComponentDoc>): Component {
  const o = doc.toObject({ getters: false, virtuals: false });
  const prices: PriceQuote[] = (o.prices ?? []).map((p) => ({
    store: p.store,
    price: p.price,
    currency: 'AUD',
    url: p.url,
    lastUpdated: toIso(p.lastUpdated),
  }));

  return {
    id: String(o._id),
    category: o.category as Component['category'],
    brand: o.brand,
    name: o.name,
    slug: o.slug,
    imageUrl: o.imageUrl ?? null,
    specs: o.specs as Component['specs'],
    benchmark: { ubRaw: o.benchmark.ubRaw, ubSource: o.benchmark.ubSource },
    performanceIndex: o.performanceIndex,
    prices,
    provenance: {
      specSourceUrl: o.provenance.specSourceUrl,
      csvRow: o.provenance.csvRow ?? undefined,
      subtypeSource: (o.provenance.subtypeSource as 'ssd' | 'hdd' | undefined) ?? undefined,
      seededAt: toIso(o.provenance.seededAt),
      unknownFields: o.provenance.unknownFields ?? [],
    },
    createdAt: toIso(o.createdAt),
    updatedAt: toIso(o.updatedAt),
  };
}
