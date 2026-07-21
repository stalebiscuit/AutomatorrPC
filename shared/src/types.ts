/**
 * Canonical contracts shared by client & server.
 * Imported by both apps so the API contract can never drift.
 * See spec §6 (data model), §8 (API), §10 (scoring), §11 (compare config).
 */

// ─── Categories ──────────────────────────────────────────────────────
export const CATEGORIES = ['cpu', 'gpu', 'ram', 'storage'] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * Comparable categories — the head-to-head Compare tool's full set. Superset of
 * the benchmarked `CATEGORIES`: it adds the assembly parts that have meaningful,
 * directly-comparable specs (cooler/case/psu/monitor) but no UserBenchmark index.
 * The compare engine leans on each category's counted spec fields, not the
 * performance index, for these. `Category ⊂ CompareCategory ⊂ BuilderCategory`.
 */
export const COMPARE_CATEGORIES = [
  'cpu',
  'gpu',
  'motherboard',
  'ram',
  'storage',
  'cooler',
  'case',
  'psu',
  'monitor',
] as const;
export type CompareCategory = (typeof COMPARE_CATEGORIES)[number];

/**
 * Builder categories — the full PCPartPicker-style build table (spec: PC Builder).
 * Superset of CATEGORIES: the four comparable/benchmarked parts plus the six
 * assembly parts the comparison tool never needed. `Category` ⊂ `BuilderCategory`.
 */
export const BUILDER_CATEGORIES = [
  'cpu',
  'cooler',
  'motherboard',
  'ram',
  'storage',
  'gpu',
  'case',
  'psu',
  'monitor',
] as const;
export type BuilderCategory = (typeof BUILDER_CATEGORIES)[number];

/** True when a builder category is comparable in the head-to-head Compare tool. */
export function isComparableCategory(c: BuilderCategory | string): c is CompareCategory {
  return (COMPARE_CATEGORIES as readonly string[]).includes(c);
}

/** True when a category is one of the benchmarked (UserBenchmark-indexed) set. */
export function isBenchmarkedCategory(c: BuilderCategory | string): c is Category {
  return (CATEGORIES as readonly string[]).includes(c);
}

export interface BuilderCategoryMeta {
  id: BuilderCategory;
  label: string;
  blurb: string;
  /** part of the comparison tool's benchmarked set */
  comparable: boolean;
  /** may appear more than once in a build (e.g. multiple drives / monitors) */
  multiInstance: boolean;
  /** required for a functional build (gates completeness in scoring) */
  essential: boolean;
}

/** Display + behaviour metadata for every builder category (build-table order). */
export const BUILDER_CATEGORY_META: BuilderCategoryMeta[] = [
  { id: 'cpu', label: 'CPU', blurb: 'Processor.', comparable: true, multiInstance: false, essential: true },
  { id: 'cooler', label: 'CPU Cooler', blurb: 'Air or AIO cooling.', comparable: false, multiInstance: false, essential: false },
  { id: 'motherboard', label: 'Motherboard', blurb: 'Socket, chipset, form factor.', comparable: false, multiInstance: false, essential: true },
  { id: 'ram', label: 'Memory', blurb: 'DDR kits.', comparable: true, multiInstance: false, essential: true },
  { id: 'storage', label: 'Storage', blurb: 'SSDs & HDDs.', comparable: true, multiInstance: true, essential: true },
  { id: 'gpu', label: 'Video Card', blurb: 'Graphics card.', comparable: true, multiInstance: false, essential: false },
  { id: 'case', label: 'Case', blurb: 'Chassis / form factor.', comparable: false, multiInstance: false, essential: true },
  { id: 'psu', label: 'Power Supply', blurb: 'Wattage & efficiency.', comparable: false, multiInstance: false, essential: true },
  { id: 'monitor', label: 'Monitor', blurb: 'Display target.', comparable: false, multiInstance: true, essential: false },
];


export type StorageSubtype = 'ssd' | 'hdd';

export interface CategoryMeta {
  id: CompareCategory;
  label: string;
  blurb: string;
}

// ─── Specs ───────────────────────────────────────────────────────────
export type SpecValue = string | number;
export type Specs = Record<string, SpecValue>;

// ─── Prices (§12) ────────────────────────────────────────────────────
export type Currency = 'AUD';

export interface PriceQuote {
  store: string;
  price: number;
  currency: Currency;
  url: string;
  /** ISO timestamp string */
  lastUpdated: string;
}

// ─── Component (§6) ──────────────────────────────────────────────────
export interface Benchmark {
  ubRaw: number;
  ubSource: string;
}

export interface Provenance {
  specSourceUrl: string;
  csvRow?: string;
  /** for storage: the source CSV subtype kept here (§11) */
  subtypeSource?: StorageSubtype;
  seededAt: string;
  /** spec fields flagged unknown rather than guessed (§ seeding rule) */
  unknownFields?: string[];
}

export interface Component {
  id: string;
  category: BuilderCategory;
  brand: string;
  name: string;
  /** unique per category */
  slug: string;
  /** null → branded per-category fallback render */
  imageUrl?: string | null;
  /** GTIN/EAN barcode — the retailer-feed join key for per-product deep links */
  gtin?: string | null;
  specs: Specs;
  benchmark: Benchmark;
  /** normalised, uncapped (reference component = 1000) — §10 */
  performanceIndex: number;
  prices: PriceQuote[];
  provenance: Provenance;
  createdAt: string;
  updatedAt: string;
}

// ─── Compare result (§3, §11) ────────────────────────────────────────
export type Direction = 'higher' | 'lower';

/** Which side leads a given row. `none` = info-only row, excluded from tally. */
export type Lead = 'a' | 'b' | 'tie' | 'none';

export interface CompareRow {
  key: string;
  label: string;
  unit?: string;
  /** raw values (null when the side lacks the field, e.g. cross-subtype) */
  valueA: SpecValue | null;
  valueB: SpecValue | null;
  /** pre-formatted display strings ("—" when absent) */
  displayA: string;
  displayB: string;
  lead: Lead;
  /** whether this row contributes to the win tally (Common group only for cross-subtype) */
  counted: boolean;
  direction?: Direction;
}

export interface ScorecardDelta {
  label: string;
  /** pre-formatted, signed where relevant (e.g. "+6.3%", "−$190") */
  value: string;
  unit?: string;
}

export interface Scorecard {
  winnerSlug: string;
  loserSlug: string;
  tally: { a: number; b: number; total: number };
  deltas: ScorecardDelta[];
  tags: string[];
  /** true when the two parts straddle storage subtypes (SSD vs HDD) */
  crossSubtype: boolean;
}

export interface CompareResult {
  category: CompareCategory;
  a: Component;
  b: Component;
  rows: CompareRow[];
  scorecard: Scorecard;
}

// ─── Verdict (§3, §7) ────────────────────────────────────────────────
export interface VerdictResponse {
  scorecard: Scorecard;
  prose: string;
  /** false while the placeholder provider is active */
  generated: boolean;
  /** present once a real model produces prose */
  model?: string;
}

// ─── Events (§6) ─────────────────────────────────────────────────────
export type SearchEventType = 'search' | 'view';

export interface SearchEvent {
  type: SearchEventType;
  category: CompareCategory;
  componentId?: string;
  pairKey?: string;
  query?: string;
  sessionId: string;
  ts: string;
}

export interface ClickEvent {
  componentId: string;
  store: string;
  url: string;
  sessionId: string;
  ts: string;
}

/**
 * A confirmed purchase attributed to a prior price-link click (affiliate
 * postback / return-URL). Pairs with ClickEvent to measure click→sale
 * conversion per store. `value` is the order value in AUD when known.
 */
export interface ConversionEvent {
  componentId?: string;
  store: string;
  url?: string;
  orderRef?: string;
  value?: number;
  sessionId?: string;
  ts: string;
}

/** Per-store funnel: clicks, attributed conversions, and the resulting rate. */
export interface StoreStat {
  store: string;
  clicks: number;
  conversions: number;
  /** conversions ÷ clicks, 0..1 (0 when there are no clicks) */
  conversionRate: number;
}

// ─── Analytics dashboard (§3, §9) ────────────────────────────────────
export type AnalyticsWindow = 'day' | 'week' | 'month';

export interface CountKey {
  key: string;
  label: string;
  count: number;
}

export interface TimeBucket {
  date: string;
  count: number;
}

export interface RecentEvent {
  kind: 'search' | 'view' | 'click';
  label: string;
  detail: string;
  ts: string;
}

export interface AnalyticsResponse {
  window: AnalyticsWindow;
  topComponents: CountKey[];
  topComparisons: CountKey[];
  topStores: CountKey[];
  /** per-store clicks + conversions + rate (drives the store panel toggle) */
  storeStats: StoreStat[];
  searchVolume: TimeBucket[];
  recentEvents: RecentEvent[];
  totals: { searches: number; views: number; clicks: number; conversions: number };
}

/** PC Builder analytics — the second dashboard view (spec: builder metrics). */
export interface BuilderAnalyticsResponse {
  window: AnalyticsWindow;
  /** builds created per day in the window */
  buildsOverTime: TimeBucket[];
  /** most-used catalogue parts across all builds */
  topParts: CountKey[];
  /** how often each category is filled across builds */
  categoryUsage: CountKey[];
  averages: {
    budget: number | null;
    score: number;
    wattage: number;
    total: number;
  };
  /** fraction of builds that include every essential category (0..1) */
  completionRate: number;
  totals: { builds: number; withBudget: number };
}

// ─── API error envelope (§13) ────────────────────────────────────────
export interface ApiError {
  error: string;
  code: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────
/** Order-stable pair key: `${category}:${slugLow}|${slugHigh}` (§6). */
export function makePairKey(category: BuilderCategory, slugA: string, slugB: string): string {
  const [low, high] = [slugA, slugB].sort();
  return `${category}:${low}|${high}`;
}

// ─── Builder: build model (PC Builder) ───────────────────────────────
export interface BuildItem {
  category: BuilderCategory;
  /** slug of the chosen catalogue component (validated against the DB) */
  slug: string;
  /** user-chosen merchant; when absent the UI shows the cheapest in-stock */
  chosenStore?: string;
}

export interface Build {
  /** short shareable id (permalink) — mirrors PCPP /list/<id> */
  shortId: string;
  name?: string;
  /** target budget used by the score (spec §8) */
  budget?: number;
  items: BuildItem[];
  createdAt: string;
  updatedAt: string;
}

/** A build resolved against the catalogue — the input to the pure solvers. */
export interface ResolvedBuildPart {
  category: BuilderCategory;
  component: Component;
  /** user-chosen merchant; absent = use the cheapest quote */
  chosenStore?: string;
}
export type ResolvedBuild = ResolvedBuildPart[];

// ─── Builder: compatibility (spec §6) ────────────────────────────────
export type Severity = 'hard' | 'soft';
export type CompatibilityStatus = 'ok' | 'warnings' | 'incompatible';

export interface Violation {
  /** stable rule id, e.g. "cpu-mobo-socket" */
  rule: string;
  severity: Severity;
  /** categories implicated (for UI highlighting) */
  categories: BuilderCategory[];
  message: string;
}

export interface CompatibilityResult {
  status: CompatibilityStatus;
  violations: Violation[];
}

// ─── Builder: wattage (spec §6.4) ────────────────────────────────────
export interface WattageEstimate {
  /** estimated system draw in watts */
  estimatedWatts: number;
  /** recommended PSU wattage (with headroom, rounded to a standard size) */
  recommendedPsuWatts: number;
}

// ─── Builder: scoring (spec §8) ──────────────────────────────────────
export interface BuildScoreBreakdown {
  compatibility: number;
  budgetFit: number;
  completeness: number;
  balance: number;
}
export interface BuildScoreResult {
  /** 0–100 headline metric */
  score: number;
  breakdown: BuildScoreBreakdown;
  notes: string[];
}

// ─── Builder: catalogue picker (spec §9) ─────────────────────────────
export type PartSort = 'performance' | 'priceAsc' | 'priceDesc' | 'name';

export interface PartFilters {
  category: BuilderCategory;
  q?: string;
  manufacturer?: string;
  /** filter to parts matching this CPU socket (cpu/motherboard/cooler) */
  socket?: string;
  priceMin?: number;
  priceMax?: number;
  sort?: PartSort;
  page?: number;
  pageSize?: number;
}

export interface PartListResult {
  components: Component[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Builder: prices-by-merchant (spec §7.2) ─────────────────────────
export interface MerchantLineItem {
  category: BuilderCategory;
  slug: string;
  name: string;
  price: number | null;
}
export interface MerchantTotal {
  store: string;
  /** parts this merchant carries out of the build */
  availableCount: number;
  totalParts: number;
  /** cost of the parts THIS store stocks (its own quotes; not back-filled from other stores) */
  total: number;
  /** true when this store stocks every part — a real single-store checkout */
  complete: boolean;
  /** $ more than the cheapest COMPLETE store; null when this store can't supply the whole build */
  difference: number | null;
  items: MerchantLineItem[];
}

// ─── Builder: hydrated build summary (server → client) ───────────────
export interface BuildSummary {
  build: Build;
  /** items resolved to catalogue components (render order) */
  parts: ResolvedBuildPart[];
  /** items whose slug wasn't found in the catalogue (hallucination guard) */
  missing: BuildItem[];
  /** running total = sum of cheapest quote per part */
  total: number;
  compatibility: CompatibilityResult;
  wattage: WattageEstimate;
  score: BuildScoreResult;
}

// ─── Affiliate links (admin-managed outbound-link decoration) ────────
export type AffiliateMode = 'off' | 'tag' | 'wrapper';

/**
 * Per-retailer affiliate configuration. `off` = pass-through (default).
 * `tag` appends `paramName=tag` to each product URL (e.g. Amazon `?tag=…`).
 * `wrapper` substitutes the product URL into `{url}` inside `wrapperTemplate`
 * (e.g. a Commission Factory deep link). Shared so client + server agree.
 */
export interface AffiliateLinkConfig {
  store: string;
  mode: AffiliateMode;
  /** tag mode: query-parameter name (default 'tag') */
  paramName: string;
  /** tag mode: the affiliate id value */
  tag: string;
  /** wrapper mode: URL template containing the literal "{url}" */
  wrapperTemplate: string;
}
