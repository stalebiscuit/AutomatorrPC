import type {
  AnalyticsResponse,
  AnalyticsWindow,
  Category,
  CountKey,
  RecentEvent,
  TimeBucket,
} from '@automatorr/shared';
import { ClickEventModel, ComponentModel, SearchEventModel, TrendRollupModel } from '../models/index.js';
import { logger } from '../lib/logger.js';

/**
 * Compact display name for dashboard lists — strips RAM spec clutter (RGB,
 * DDR4/5 speed, CL latency, and the (2×16GB) kit config) so long memory names
 * sit on one line. CPU/GPU/storage names contain none of these tokens and pass
 * through unchanged.
 */
function shortComponentName(name: string): string {
  return name
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*DDR[45]-\d+/gi, '')
    .replace(/\s*\bCL\d+\b/gi, '')
    .replace(/\s*\bRGB\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─── Capture (append-only, no PII) ───────────────────────────────────
export interface RecordSearchInput {
  type?: 'search' | 'view';
  category: Category;
  query?: string;
  componentId?: string;
  pairKey?: string;
  sessionId: string;
}

export async function recordSearch(input: RecordSearchInput): Promise<void> {
  await SearchEventModel.create({
    type: input.type ?? 'search',
    category: input.category,
    query: input.query,
    componentId: input.componentId,
    pairKey: input.pairKey,
    sessionId: input.sessionId,
    ts: new Date(),
  });
}

export interface RecordClickInput {
  componentId: string;
  store: string;
  url: string;
  sessionId: string;
}

export async function recordClick(input: RecordClickInput): Promise<void> {
  await ClickEventModel.create({ ...input, ts: new Date() });
}

// ─── Read (dashboard) ────────────────────────────────────────────────
const WINDOW_DAYS: Record<AnalyticsWindow, number> = { day: 1, week: 7, month: 30 };

export function windowStart(window: AnalyticsWindow, now = new Date()): Date {
  return new Date(now.getTime() - WINDOW_DAYS[window] * 24 * 60 * 60 * 1000);
}

interface AggRow {
  _id: string;
  count: number;
}

async function resolveComponentNames(ids: string[]): Promise<Map<string, string>> {
  const valid = ids.filter((id) => /^[a-f0-9]{24}$/i.test(id));
  const docs = valid.length ? await ComponentModel.find({ _id: { $in: valid } }) : [];
  return new Map(docs.map((d) => [String(d._id), d.name]));
}

/** `${category}:${slug}` → component name, for pairKey labelling. */
async function resolveSlugNames(keys: Set<string>): Promise<Map<string, string>> {
  const pairs = [...keys].map((k) => {
    const [category, slug] = splitCatSlug(k);
    return { category, slug };
  });
  if (!pairs.length) return new Map();
  const docs = await ComponentModel.find({ $or: pairs });
  return new Map(docs.map((d) => [`${d.category}:${d.slug}`, d.name]));
}

function splitCatSlug(catSlug: string): [string, string] {
  const idx = catSlug.indexOf(':');
  return idx === -1 ? ['', catSlug] : [catSlug.slice(0, idx), catSlug.slice(idx + 1)];
}

/** Parse `${category}:${slugLow}|${slugHigh}` → its two `${category}:${slug}` halves. */
function pairKeyParts(pairKey: string): [string, string] | null {
  const [category, rest] = splitCatSlug(pairKey);
  if (!rest.includes('|')) return null;
  const [low, high] = rest.split('|');
  return [`${category}:${low}`, `${category}:${high}`];
}

export async function getAnalytics(window: AnalyticsWindow): Promise<AnalyticsResponse> {
  const since = windowStart(window);
  const inWindow = { ts: { $gte: since } };

  const [searches, views, clicks] = await Promise.all([
    SearchEventModel.countDocuments({ ...inWindow, type: 'search' }),
    SearchEventModel.countDocuments({ ...inWindow, type: 'view' }),
    ClickEventModel.countDocuments(inWindow),
  ]);

  const [storeAgg, compAgg, pairAgg, volAgg] = await Promise.all([
    ClickEventModel.aggregate<AggRow>([
      { $match: inWindow },
      { $group: { _id: '$store', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]),
    SearchEventModel.aggregate<AggRow>([
      { $match: { ...inWindow, componentId: { $exists: true, $ne: null } } },
      { $group: { _id: '$componentId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]),
    SearchEventModel.aggregate<AggRow>([
      { $match: { ...inWindow, type: 'view', pairKey: { $exists: true, $ne: null } } },
      { $group: { _id: '$pairKey', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]),
    SearchEventModel.aggregate<AggRow>([
      { $match: { ...inWindow, type: 'search' } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$ts' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const topStores: CountKey[] = storeAgg.map((r) => ({ key: r._id, label: r._id, count: r.count }));

  const nameById = await resolveComponentNames(compAgg.map((r) => r._id));
  const topComponents: CountKey[] = compAgg.map((r) => ({
    key: r._id,
    label: shortComponentName(nameById.get(r._id) ?? r._id),
    count: r.count,
  }));

  const slugKeys = new Set<string>();
  for (const r of pairAgg) {
    const parts = pairKeyParts(r._id);
    if (parts) parts.forEach((p) => slugKeys.add(p));
  }
  const slugNames = await resolveSlugNames(slugKeys);
  const topComparisons: CountKey[] = pairAgg.map((r) => {
    const parts = pairKeyParts(r._id);
    const label = parts
      ? `${shortComponentName(slugNames.get(parts[0]) ?? parts[0])} vs ${shortComponentName(slugNames.get(parts[1]) ?? parts[1])}`
      : r._id;
    return { key: r._id, label, count: r.count };
  });

  const searchVolume: TimeBucket[] = volAgg.map((r) => ({ date: r._id, count: r.count }));

  const recentEvents = await getRecentEvents();

  return {
    window,
    topComponents,
    topComparisons,
    topStores,
    searchVolume,
    recentEvents,
    totals: { searches, views, clicks },
  };
}

async function getRecentEvents(limit = 12): Promise<RecentEvent[]> {
  const [se, ce] = await Promise.all([
    SearchEventModel.find().sort({ ts: -1 }).limit(limit),
    ClickEventModel.find().sort({ ts: -1 }).limit(limit),
  ]);
  const events: RecentEvent[] = [
    ...se.map((e) => ({
      kind: e.type as 'search' | 'view',
      label: e.type === 'view' ? 'Comparison viewed' : `Search · ${e.category.toUpperCase()}`,
      detail: e.query || e.pairKey || e.componentId || e.category,
      ts: (e.ts as Date).toISOString(),
    })),
    ...ce.map((e) => ({
      kind: 'click' as const,
      label: `Price click · ${e.store}`,
      detail: e.url,
      ts: (e.ts as Date).toISOString(),
    })),
  ];
  return events.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, limit);
}

// ─── Rollups (scheduled, for fast dashboard reads) ───────────────────
export async function buildRollups(): Promise<void> {
  const today = new Date();
  const day = new Date(today.toISOString().slice(0, 10));
  const analytics = await getAnalytics('day');

  const metrics: { metric: 'topComponents' | 'topStores' | 'searchVolume' | 'topComparisons'; data: { key: string; count: number }[] }[] = [
    { metric: 'topComponents', data: analytics.topComponents.map((c) => ({ key: c.label, count: c.count })) },
    { metric: 'topStores', data: analytics.topStores.map((c) => ({ key: c.label, count: c.count })) },
    { metric: 'topComparisons', data: analytics.topComparisons.map((c) => ({ key: c.label, count: c.count })) },
    { metric: 'searchVolume', data: analytics.searchVolume.map((b) => ({ key: b.date, count: b.count })) },
  ];

  for (const m of metrics) {
    await TrendRollupModel.updateOne(
      { window: 'day', date: day, metric: m.metric },
      { $set: { data: m.data, generatedAt: new Date() } },
      { upsert: true },
    );
  }
  logger.info(`Rollups built for ${day.toISOString().slice(0, 10)}`);
}
