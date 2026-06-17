/**
 * Canonical contracts shared by client & server.
 * Imported by both apps so the API contract can never drift.
 * See spec §6 (data model), §8 (API), §10 (scoring), §11 (compare config).
 */

// ─── Categories ──────────────────────────────────────────────────────
export const CATEGORIES = ['cpu', 'gpu', 'ram', 'storage'] as const;
export type Category = (typeof CATEGORIES)[number];

export type StorageSubtype = 'ssd' | 'hdd';

export interface CategoryMeta {
  id: Category;
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
  category: Category;
  brand: string;
  name: string;
  /** unique per category */
  slug: string;
  /** null → branded per-category fallback render */
  imageUrl?: string | null;
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
  category: Category;
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
  category: Category;
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
  searchVolume: TimeBucket[];
  recentEvents: RecentEvent[];
  totals: { searches: number; views: number; clicks: number };
}

// ─── API error envelope (§13) ────────────────────────────────────────
export interface ApiError {
  error: string;
  code: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────
/** Order-stable pair key: `${category}:${slugLow}|${slugHigh}` (§6). */
export function makePairKey(category: Category, slugA: string, slugB: string): string {
  const [low, high] = [slugA, slugB].sort();
  return `${category}:${low}|${high}`;
}
