import type { Component, BuilderCategory, PriceQuote, ResolvedBuild, Specs } from '../src/types.js';

let seq = 0;

export function mkComponent(
  category: BuilderCategory,
  specs: Specs,
  opts: { name?: string; performanceIndex?: number; prices?: PriceQuote[] } = {},
): Component {
  seq += 1;
  const name = opts.name ?? `${category}-${seq}`;
  return {
    id: `id-${seq}`,
    category,
    brand: 'TestBrand',
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    imageUrl: null,
    specs,
    benchmark: { ubRaw: 100, ubSource: 'test' },
    performanceIndex: opts.performanceIndex ?? 1000,
    prices: opts.prices ?? [],
    provenance: { specSourceUrl: 'test://', seededAt: '2026-01-01T00:00:00.000Z', unknownFields: [] },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

export function price(store: string, p: number): PriceQuote {
  return { store, price: p, currency: 'AUD', url: `https://x/${store}`, lastUpdated: '2026-01-01T00:00:00.000Z' };
}

export function build(...parts: Array<[BuilderCategory, Component]>): ResolvedBuild {
  return parts.map(([category, component]) => ({ category, component }));
}

/** A fully compatible, complete AM5 build used as a baseline in several tests. */
export function goodBuild(): ResolvedBuild {
  const cpu = mkComponent('cpu', { socket: 'AM5', tdp: 65, igpu: 'None' }, { performanceIndex: 1000, prices: [price('Mwave', 300)] });
  const cooler = mkComponent('cooler', { type: 'air', height: 150, socketSupport: 'AM5,AM4,LGA1700' }, { prices: [price('Mwave', 60)] });
  const mobo = mkComponent('motherboard', { socket: 'AM5', ramType: 'DDR5', ramSlots: 4, maxRamSpeed: 6400, formFactor: 'ATX' }, { prices: [price('Mwave', 250)] });
  const ram = mkComponent('ram', { type: 'DDR5', speedMTs: 6000, kitConfig: '2 × 16 GB' }, { performanceIndex: 1000, prices: [price('Mwave', 120)] });
  const storage = mkComponent('storage', { subtype: 'ssd', capacity: 2000, formFactor: 'M.2 2280' }, { performanceIndex: 1000, prices: [price('Mwave', 150)] });
  const gpu = mkComponent('gpu', { length: 300, tbp: 200 }, { performanceIndex: 1000, prices: [price('Mwave', 600)] });
  const pcCase = mkComponent('case', { formFactorSupport: 'ATX,Micro-ATX,Mini-ITX', maxGpuLength: 360, maxCoolerHeight: 170 }, { prices: [price('Mwave', 120)] });
  const psu = mkComponent('psu', { wattage: 750, efficiency: '80+ Gold' }, { prices: [price('Mwave', 130)] });
  return build(
    ['cpu', cpu], ['cooler', cooler], ['motherboard', mobo], ['ram', ram],
    ['storage', storage], ['gpu', gpu], ['case', pcCase], ['psu', psu],
  );
}
