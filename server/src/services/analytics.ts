import type {
  AnalyticsResponse,
  AnalyticsWindow,
  BuilderAnalyticsResponse,
  CompareCategory,
  CountKey,
  RecentEvent,
  StoreStat,
  TimeBucket,
} from '@automatorr/shared';
import {
  BUILDER_CATEGORY_META,
  scoreBuild,
  buildTotal,
  estimateWattage,
} from '@automatorr/shared';
import {
  BuildModel,
  ClickEventModel,
  ComponentModel,
  ConversionEventModel,
  SearchEventModel,
  TrendRollupModel,
} from '../models/index.js';
import { getComponent } from './catalog.js';
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
  category: CompareCategory;
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

export interface RecordConversionInput {
  store: string;
  componentId?: string;
  url?: string;
  orderRef?: string;
  value?: number;
  sessionId?: string;
}

/** Record a confirmed sale attributed to a store (affiliate postback). */
export async function recordConversion(input: RecordConversionInput): Promise<void> {
  await ConversionEventModel.create({ ...input, ts: new Date() });
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

  const [searches, views, clicks, conversions] = await Promise.all([
    SearchEventModel.countDocuments({ ...inWindow, type: 'search' }),
    SearchEventModel.countDocuments({ ...inWindow, type: 'view' }),
    ClickEventModel.countDocuments(inWindow),
    ConversionEventModel.countDocuments(inWindow),
  ]);

  const [storeAgg, convAgg, compAgg, pairAgg, volAgg] = await Promise.all([
    ClickEventModel.aggregate<AggRow>([
      { $match: inWindow },
      { $group: { _id: '$store', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]),
    ConversionEventModel.aggregate<AggRow>([
      { $match: inWindow },
      { $group: { _id: '$store', count: { $sum: 1 } } },
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

  // Per-store funnel: clicks + attributed conversions + rate (drives the toggle).
  const convByStore = new Map(convAgg.map((r) => [r._id, r.count]));
  const storeStats: StoreStat[] = storeAgg.map((r) => {
    const conv = convByStore.get(r._id) ?? 0;
    return {
      store: r._id,
      clicks: r.count,
      conversions: conv,
      conversionRate: r.count > 0 ? conv / r.count : 0,
    };
  });

  const nameById = await resolveComponentNames(compAgg.map((r) => r._id));
  const topComponents: CountKey[] = compAgg
    // Skip components that no longer exist in the catalogue (orphaned events) so
    // the panel shows real names, never a raw Mongo id.
    .filter((r) => nameById.has(r._id))
    .map((r) => ({
      key: r._id,
      label: shortComponentName(nameById.get(r._id) as string),
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
    storeStats,
    searchVolume,
    recentEvents,
    totals: { searches, views, clicks, conversions },
  };
}

/** Turn a raw price-click URL into a readable host, e.g. "scorptec.com.au". */
function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** `${category}:${slugLow}|${slugHigh}` → "Name vs Name" using resolved slugs. */
function labelPairKey(pairKey: string, slugNames: Map<string, string>): string {
  const parts = pairKeyParts(pairKey);
  if (!parts) return pairKey;
  return `${shortComponentName(slugNames.get(parts[0]) ?? parts[0])} vs ${shortComponentName(
    slugNames.get(parts[1]) ?? parts[1],
  )}`;
}

async function getRecentEvents(limit = 12): Promise<RecentEvent[]> {
  const [se, ce] = await Promise.all([
    SearchEventModel.find().sort({ ts: -1 }).limit(limit),
    ClickEventModel.find().sort({ ts: -1 }).limit(limit),
  ]);

  // Resolve the ObjectIds and pair keys these events reference into human names
  // so the "Detail" column never shows a raw Mongo id (e.g. 6a5457162cb7…).
  const componentIds = [
    ...se.map((e) => e.componentId).filter((v): v is string => Boolean(v)),
    ...ce.map((e) => e.componentId).filter((v): v is string => Boolean(v)),
  ];
  const slugKeys = new Set<string>();
  for (const e of se) {
    if (e.pairKey) {
      const parts = pairKeyParts(e.pairKey);
      if (parts) parts.forEach((p) => slugKeys.add(p));
    }
  }
  const [nameById, slugNames] = await Promise.all([
    resolveComponentNames(componentIds),
    resolveSlugNames(slugKeys),
  ]);

  const detailForSearch = (e: (typeof se)[number]): string => {
    // Prefer the actual component name when the search resolved to one.
    if (e.componentId && nameById.has(e.componentId)) {
      return shortComponentName(nameById.get(e.componentId) as string);
    }
    if (e.query) return e.query;
    if (e.pairKey) return labelPairKey(e.pairKey, slugNames);
    return e.category.toUpperCase();
  };

  const events: RecentEvent[] = [
    ...se.map((e) => ({
      kind: e.type as 'search' | 'view',
      label: e.type === 'view' ? 'Comparison viewed' : `Search · ${e.category.toUpperCase()}`,
      detail: detailForSearch(e),
      ts: (e.ts as Date).toISOString(),
    })),
    ...ce.map((e) => ({
      kind: 'click' as const,
      label: `Price click · ${e.store}`,
      detail: `${shortComponentName(nameById.get(e.componentId) ?? '')} · ${hostOf(e.url)}`.replace(
        /^ · /,
        '',
      ),
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

// ─── PC Builder analytics (second dashboard view — Task 3.4) ──────────
/**
 * Metrics derived from saved builds (BuildModel). Build creation isn't a
 * separate event stream, so we aggregate the build documents directly and
 * resolve their referenced parts through the catalogue to score them.
 */
export async function getBuilderAnalytics(
  window: AnalyticsWindow,
): Promise<BuilderAnalyticsResponse> {
  const since = windowStart(window);
  const builds = await BuildModel.find({ createdAt: { $gte: since } }).sort({ createdAt: -1 });

  // Resolve every referenced part once, then reuse across builds.
  const keySet = new Set<string>();
  for (const b of builds) for (const it of b.items ?? []) keySet.add(`${it.category}:${it.slug}`);
  const resolved = new Map<string, Awaited<ReturnType<typeof getComponent>>>();
  await Promise.all(
    [...keySet].map(async (k) => {
      const [category, slug] = splitCatSlug(k);
      resolved.set(k, await getComponent(category as never, slug));
    }),
  );

  const essentials = BUILDER_CATEGORY_META.filter((m) => m.essential).map((m) => m.id);
  const partCounts = new Map<string, number>();
  const partNames = new Map<string, string>();
  const categoryCounts = new Map<string, number>();
  const dayCounts = new Map<string, number>();

  let scoreSum = 0;
  let wattSum = 0;
  let totalSum = 0;
  let budgetSum = 0;
  let withBudget = 0;
  let complete = 0;

  for (const b of builds) {
    const parts = (b.items ?? [])
      .map((it) => {
        const c = resolved.get(`${it.category}:${it.slug}`);
        return c ? { category: it.category as never, component: c, chosenStore: it.chosenStore ?? undefined } : null;
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    // Per-build scoring/wattage/total (reuses the shared pure solvers).
    scoreSum += scoreBuild(parts, b.budget ? { budget: b.budget } : {}).score;
    wattSum += estimateWattage(parts);
    totalSum += buildTotal(parts);
    if (typeof b.budget === 'number' && b.budget > 0) {
      budgetSum += b.budget;
      withBudget += 1;
    }

    const present = new Set(parts.map((p) => p.category as string));
    if (essentials.every((c) => present.has(c))) complete += 1;

    for (const c of present) categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1);
    for (const p of parts) {
      const key = `${p.category}:${p.component.slug}`;
      partCounts.set(key, (partCounts.get(key) ?? 0) + 1);
      partNames.set(key, p.component.name);
    }
    const day = (b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt as never))
      .toISOString()
      .slice(0, 10);
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
  }

  const n = builds.length || 1;
  const topParts: CountKey[] = [...partCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([key, count]) => ({ key, label: shortComponentName(partNames.get(key) ?? key), count }));

  const categoryUsage: CountKey[] = [...categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({
      key,
      label: BUILDER_CATEGORY_META.find((m) => m.id === key)?.label ?? key,
      count,
    }));

  const buildsOverTime: TimeBucket[] = [...dayCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));

  return {
    window,
    buildsOverTime,
    topParts,
    categoryUsage,
    averages: {
      budget: withBudget ? Math.round(budgetSum / withBudget) : null,
      score: Math.round(scoreSum / n),
      wattage: Math.round(wattSum / n),
      total: Math.round(totalSum / n),
    },
    completionRate: builds.length ? complete / builds.length : 0,
    totals: { builds: builds.length, withBudget },
  };
}
