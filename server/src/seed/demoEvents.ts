import { type CompareCategory, isComparableCategory, makePairKey } from '@automatorr/shared';
import { ClickEventModel, ComponentModel, ConversionEventModel, SearchEventModel } from '../models/index.js';
import { logger } from '../lib/logger.js';

/**
 * DEMO-ONLY analytics baseline (called from devServer.ts, never from the shared
 * seed). Fabricates a realistic, deterministic stream of search/view/click
 * events so the admin dashboard looks alive out of the box. Stores NO PII —
 * sessionIds are anonymous. In production these are never inserted; the
 * dashboard fills purely from real traffic.
 */

export interface DemoPriceRef {
  store: string;
  url: string;
}
export interface DemoComponent {
  id: string;
  category: CompareCategory;
  name: string;
  brand: string;
  slug: string;
  prices: DemoPriceRef[];
}
export interface DemoSearchEvent {
  type: 'search' | 'view';
  category: CompareCategory;
  componentId?: string;
  pairKey?: string;
  query?: string;
  sessionId: string;
  ts: Date;
}
export interface DemoClickEvent {
  componentId: string;
  store: string;
  url: string;
  sessionId: string;
  ts: Date;
}
export interface DemoConversionEvent {
  componentId: string;
  store: string;
  url: string;
  sessionId: string;
  ts: Date;
}
export interface DemoEventBundle {
  searchEvents: DemoSearchEvent[];
  clickEvents: DemoClickEvent[];
  conversionEvents: DemoConversionEvent[];
}

export interface BuildDemoOptions {
  now?: Date;
  days?: number;
  searches?: number;
  views?: number;
  clicks?: number;
  sessions?: number;
  seed?: number;
}

/** Mainstream parts that trend harder in the fabricated stream. */
const HOT = new Set<string>([
  'nvidia-geforce-rtx-4070',
  'nvidia-geforce-rtx-4090',
  'nvidia-geforce-rtx-4060',
  'amd-radeon-rx-7800-xt',
  'amd-ryzen-7-7800x3d',
  'intel-core-i5-14600k',
  'intel-core-i9-14900k',
  'amd-ryzen-5-7600x',
  'samsung-990-pro-2tb',
  'samsung-980-pro-1tb',
  'corsair-vengeance-rgb-ddr5-6000-cl30-32gb',
  'gskill-trident-z5-rgb-ddr5-6000-cl30-32gb',
]);

const CATEGORY_WEIGHT: Partial<Record<CompareCategory, number>> = { gpu: 1.4, cpu: 1.3, ram: 0.8, storage: 0.9 };

/** Small deterministic PRNG (mulberry32) so the baseline is identical each boot. */
function mulberry32(a: number): () => number {
  let s = a >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickCategory(rng: () => number, cats: CompareCategory[]): CompareCategory {
  let total = 0;
  for (const c of cats) total += CATEGORY_WEIGHT[c] ?? 1;
  let r = rng() * total;
  for (const c of cats) {
    r -= CATEGORY_WEIGHT[c] ?? 1;
    if (r <= 0) return c;
  }
  return cats[cats.length - 1]!;
}

function weightedPick(
  rng: () => number,
  pool: DemoComponent[],
  weight: Map<string, number>,
): DemoComponent {
  let total = 0;
  for (const c of pool) total += weight.get(c.id) ?? 1;
  let r = rng() * total;
  for (const c of pool) {
    r -= weight.get(c.id) ?? 1;
    if (r <= 0) return c;
  }
  return pool[pool.length - 1]!;
}

/**
 * Weekly demand shape: a gentle rising recency trend with a pronounced spike on
 * one weekday. Sampling a day-offset from these weights makes "searches per day"
 * read as a lively chart with a clear weekly peak instead of a flat line.
 */
const SPIKE_WEEKDAY = 6; // Saturday — the weekly peak
const SPIKE_MULTIPLIER = 3.6;

function makeDaySampler(now: Date, days: number): (rng: () => number) => number {
  const weights: number[] = [];
  let total = 0;
  for (let off = 0; off < days; off++) {
    const day = new Date(now.getTime() - off * 86_400_000);
    const recency = 0.55 + 0.45 * (1 - off / days);
    const weekly = day.getDay() === SPIKE_WEEKDAY ? SPIKE_MULTIPLIER : 1;
    const w = recency * weekly;
    weights.push(w);
    total += w;
  }
  return (rng) => {
    let r = rng() * total;
    for (let off = 0; off < days; off++) {
      r -= weights[off]!;
      if (r <= 0) return off;
    }
    return days - 1;
  };
}

/** Timestamp `dayOffset` days before `now`, at a random time within that day. */
function tsFromOffset(rng: () => number, now: Date, dayOffset: number): Date {
  return new Date(now.getTime() - dayOffset * 86_400_000 - Math.floor(rng() * 86_400_000));
}

function makeQuery(rng: () => number, c: DemoComponent): string {
  const roll = rng();
  if (roll < 0.5) return c.name;
  if (roll < 0.75) return c.brand;
  return c.name.split(' ').slice(0, 2).join(' ');
}

/** Pure generator — no DB. Deterministic given the same options. */
export function buildDemoEvents(
  components: DemoComponent[],
  opts: BuildDemoOptions = {},
): DemoEventBundle {
  const now = opts.now ?? new Date();
  const days = opts.days ?? 30;
  const nSearch = opts.searches ?? 300;
  const nView = opts.views ?? 190;
  const nClick = opts.clicks ?? 150;
  const nSessions = opts.sessions ?? 55;
  const rng = mulberry32(opts.seed ?? 0x9e3779b9);
  const sampleDayOffset = makeDaySampler(now, days);

  if (components.length === 0) return { searchEvents: [], clickEvents: [], conversionEvents: [] };

  const sessions = Array.from(
    { length: nSessions },
    () => `demo-${Math.floor(rng() * 0xffffffff).toString(36)}`,
  );
  const pickSession = (): string => sessions[Math.floor(rng() * sessions.length)]!;

  const byCat = new Map<CompareCategory, DemoComponent[]>();
  for (const c of components) {
    const list = byCat.get(c.category);
    if (list) list.push(c);
    else byCat.set(c.category, [c]);
  }
  const cats = [...byCat.keys()];

  const weight = new Map<string, number>();
  for (const c of components) {
    weight.set(c.id, (CATEGORY_WEIGHT[c.category] ?? 1) * (HOT.has(c.slug) ? 2.5 : 1) * (0.4 + rng()));
  }

  const searchEvents: DemoSearchEvent[] = [];

  for (let i = 0; i < nSearch; i++) {
    const cat = pickCategory(rng, cats);
    const c = weightedPick(rng, byCat.get(cat)!, weight);
    const ev: DemoSearchEvent = { type: 'search', category: cat, sessionId: pickSession(), ts: tsFromOffset(rng, now, sampleDayOffset(rng)) };
    if (rng() < 0.7) ev.componentId = c.id;
    if (rng() < 0.85) ev.query = makeQuery(rng, c);
    searchEvents.push(ev);
  }

  for (let i = 0; i < nView; i++) {
    const cat = pickCategory(rng, cats);
    const pool = byCat.get(cat)!;
    if (pool.length < 2) continue;
    const a = weightedPick(rng, pool, weight);
    let b = weightedPick(rng, pool, weight);
    for (let tries = 0; b.id === a.id && tries < 5; tries++) b = weightedPick(rng, pool, weight);
    if (b.id === a.id) continue;
    searchEvents.push({
      type: 'view',
      category: cat,
      pairKey: makePairKey(cat, a.slug, b.slug),
      sessionId: pickSession(),
      ts: tsFromOffset(rng, now, sampleDayOffset(rng)),
    });
  }

  const clickEvents: DemoClickEvent[] = [];
  for (let i = 0; i < nClick; i++) {
    const cat = pickCategory(rng, cats);
    const c = weightedPick(rng, byCat.get(cat)!, weight);
    if (c.prices.length === 0) continue;
    const p = c.prices[Math.floor(rng() * c.prices.length)]!;
    clickEvents.push({ componentId: c.id, store: p.store, url: p.url, sessionId: pickSession(), ts: tsFromOffset(rng, now, sampleDayOffset(rng)) });
  }

  // ~18% of clicks convert into a sale (demo funnel).
  const conversionEvents: DemoConversionEvent[] = [];
  for (const ev of clickEvents) {
    if (rng() < 0.18) conversionEvents.push({ ...ev });
  }

  return { searchEvents, clickEvents, conversionEvents };
}

/** DEMO-ONLY: read the seeded catalogue and insert a fabricated event baseline. */
export async function seedDemoEvents(
  opts: { force?: boolean } = {},
): Promise<{ searches: number; views: number; clicks: number }> {
  const existing = await SearchEventModel.estimatedDocumentCount();
  if (existing > 0 && !opts.force) {
    logger.info('Demo events already present — skipping event seed (pass { force: true } to regenerate)');
    return { searches: 0, views: 0, clicks: 0 };
  }
  if (opts.force) {
    // Clear the event streams so regenerated events reference the CURRENT
    // catalogue's component ids (stale ids otherwise show as raw ObjectIds).
    await Promise.all([
      SearchEventModel.deleteMany({}),
      ClickEventModel.deleteMany({}),
      ConversionEventModel.deleteMany({}),
    ]);
    logger.info('Cleared existing analytics events for a clean re-seed');
  }

  const docs = await ComponentModel.find({});
  const components: DemoComponent[] = docs
    // Only the comparable categories are tracked as search/view/click events
    // (the SearchEvent schema enum excludes builder-only parts like motherboard).
    .filter((d) => isComparableCategory(d.category))
    .map((d) => ({
      id: String(d._id),
      category: d.category as CompareCategory,
      name: d.name,
      brand: d.brand,
      slug: d.slug,
      prices: (d.prices ?? []).map((p) => ({ store: p.store, url: p.url })),
    }));

  const { searchEvents, clickEvents, conversionEvents } = buildDemoEvents(components);
  if (searchEvents.length > 0) await SearchEventModel.insertMany(searchEvents);
  if (clickEvents.length > 0) await ClickEventModel.insertMany(clickEvents);
  if (conversionEvents.length > 0) await ConversionEventModel.insertMany(conversionEvents);

  const views = searchEvents.filter((e) => e.type === 'view').length;
  const searches = searchEvents.length - views;
  logger.info(
    `Seeded demo analytics baseline — ${searches} searches, ${views} views, ${clickEvents.length} clicks`,
  );
  return { searches, views, clicks: clickEvents.length };
}
