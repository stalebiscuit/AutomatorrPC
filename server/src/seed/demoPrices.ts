/**
 * Demo pricing seeder. The curated catalogue ships with empty `prices[]` (real
 * prices arrive via the scraper / affiliate feeds later). For a populated demo —
 * so the compare verdict, per-merchant totals and PRICE deltas all render — this
 * synthesises plausible AUD quotes across a few AU retailers, each with a working
 * store search deep-link. Deterministic (seeded) and idempotent by default.
 */
import type { BuilderCategory } from '@automatorr/shared';
import { ComponentModel } from '../models/index.js';
import { logger } from '../lib/logger.js';

interface StoreDef {
  store: string;
  /** builds a product search deep-link from the component name */
  url: (q: string) => string;
}

const STORES: StoreDef[] = [
  { store: 'Scorptec', url: (q) => `https://www.scorptec.com.au/search/go?w=${encodeURIComponent(q)}` },
  { store: 'Mwave', url: (q) => `https://www.mwave.com.au/search?q=${encodeURIComponent(q)}` },
  { store: 'PLE Computers', url: (q) => `https://www.ple.com.au/Catalogue/search?q=${encodeURIComponent(q)}` },
  { store: 'Centre Com', url: (q) => `https://www.centrecom.com.au/catalogsearch/result/?q=${encodeURIComponent(q)}` },
];

/** Base AUD price by category + a per-index component for benchmarked parts. */
const PRICE_MODEL: Record<BuilderCategory, { base: number; perIndex: number }> = {
  cpu: { base: 180, perIndex: 0.42 },
  gpu: { base: 300, perIndex: 1.35 },
  ram: { base: 70, perIndex: 0.09 },
  storage: { base: 55, perIndex: 0.22 },
  motherboard: { base: 180, perIndex: 0 },
  cooler: { base: 55, perIndex: 0 },
  case: { base: 110, perIndex: 0 },
  psu: { base: 95, perIndex: 0 },
  monitor: { base: 260, perIndex: 0 },
};

/** Non-benchmarked categories price off a spec signal instead of the index. */
function specDrivenBase(category: BuilderCategory, specs: Record<string, unknown>): number {
  const n = (k: string): number => {
    const v = specs[k];
    return typeof v === 'number' ? v : typeof v === 'string' ? Number(v) || 0 : 0;
  };
  switch (category) {
    case 'motherboard':
      return 180 + (/z\d|x\d/i.test(String(specs.chipset ?? '')) ? 140 : 40);
    case 'cooler':
      return 45 + n('tdpRating') * 0.4 + (String(specs.type).toLowerCase() === 'aio' ? 60 : 0);
    case 'case':
      return 90 + n('maxGpuLength') * 0.25;
    case 'psu':
      return 60 + n('wattage') * 0.13;
    case 'monitor':
      return 120 + n('size') * 6 + n('refreshHz') * 0.5;
    default:
      return 0;
  }
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Populate `prices[]` for every component that has none (or all, when force). */
export async function seedDemoPrices(opts: { force?: boolean } = {}): Promise<number> {
  const filter = opts.force ? {} : { $or: [{ prices: { $size: 0 } }, { prices: { $exists: false } }] };
  const docs = await ComponentModel.find(filter);
  let updated = 0;

  for (const doc of docs) {
    const category = doc.category as BuilderCategory;
    const rng = mulberry32(hashSeed(`${category}:${doc.slug}`));
    const model = PRICE_MODEL[category] ?? { base: 100, perIndex: 0 };
    const indexBase = model.base + (doc.performanceIndex ?? 0) * model.perIndex;
    const base = model.perIndex > 0 ? indexBase : specDrivenBase(category, doc.specs as Record<string, unknown>) || model.base;

    // 2–3 stores carry it, each within ±6% of a mid price, rounded to $.95.
    const nStores = 2 + Math.floor(rng() * 2);
    const chosen = [...STORES].sort(() => rng() - 0.5).slice(0, nStores);
    const prices = chosen.map((st) => {
      const variance = 1 + (rng() - 0.5) * 0.12; // ±6%
      const raw = Math.max(19, base * variance);
      const price = Math.round(raw) - 0.05; // .95 psychological price
      return {
        store: st.store,
        price: Math.round(price * 100) / 100,
        currency: 'AUD' as const,
        url: st.url(`${doc.brand} ${doc.name}`),
        lastUpdated: new Date(),
      };
    });

    await ComponentModel.updateOne({ _id: doc._id }, { $set: { prices } });
    updated += 1;
  }
  logger.info(`Seeded demo prices for ${updated} components`);
  return updated;
}
