import type {
  Component,
  CompareResult,
  CompareRow,
  Lead,
  Scorecard,
  ScorecardDelta,
  SpecValue,
  StorageSubtype,
} from '@automatorr/shared';
import { getCompareConfig, type CompareField, type DeltaFormat } from './compareConfig.js';

const MINUS = '−'; // typographic minus, matches the mockup

type Side = 'a' | 'b';

/** Short uppercase labels for the decisive-delta tiles (mockup voice). */
const DELTA_LABELS: Record<string, string> = {
  performanceIndex: 'PERFORMANCE',
  price: 'PRICE',
  pricePerTB: '$/TB',
  tdp: 'POWER',
  tbp: 'POWER',
  speedMTs: 'SPEED',
  capacity: 'CAPACITY',
  seqRead: 'READ',
  seqWrite: 'WRITE',
};

function subtypeOf(c: Component): StorageSubtype | undefined {
  const s = c.specs.subtype;
  return s === 'ssd' || s === 'hdd' ? s : undefined;
}

function bestPrice(c: Component): number | null {
  if (!c.prices.length) return null;
  return Math.min(...c.prices.map((p) => p.price));
}

function capacityTB(c: Component): number | null {
  const cap = c.specs.capacity;
  if (typeof cap !== 'number' || cap <= 0) return null;
  return cap / 1000; // specs.capacity is GB
}

/** Resolve a (possibly derived) field value for a component. */
function rawValue(c: Component, key: string): SpecValue | null {
  if (key === 'performanceIndex') return c.performanceIndex;
  if (key === 'price') return bestPrice(c);
  if (key === 'pricePerTB') {
    const price = bestPrice(c);
    const tb = capacityTB(c);
    return price !== null && tb ? Math.round(price / tb) : null;
  }
  const v = c.specs[key];
  return v === undefined ? null : v;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-AU', { maximumFractionDigits: 2 }).format(n);
}

function formatDisplay(field: CompareField, raw: SpecValue | null): string {
  if (raw === null || raw === '') return '—';
  if (field.key === 'price') return `$${formatNumber(Number(raw))}`;
  if (field.key === 'pricePerTB') return `$${formatNumber(Number(raw))}/TB`;
  if (typeof raw === 'number') {
    return field.unit ? `${formatNumber(raw)} ${field.unit}` : formatNumber(raw);
  }
  return String(raw);
}

/** Is a grouped storage field in scope for this pair (rendered at all)? */
function fieldInScope(field: CompareField, subA?: StorageSubtype, subB?: StorageSubtype): boolean {
  if (!field.group || field.group === 'common') return true;
  // ssd/hdd-only: render if at least one side is of that subtype.
  return field.group === subA || field.group === subB;
}

/** Does this field count toward the win tally for this pair? */
function fieldCounts(field: CompareField, subA?: StorageSubtype, subB?: StorageSubtype): boolean {
  if (!field.numeric || !field.counted) return false;
  if (!field.group || field.group === 'common') return true;
  // Subtype-unique field counts only when BOTH sides share that subtype.
  return field.group === subA && field.group === subB;
}

function leadOf(field: CompareField, a: SpecValue | null, b: SpecValue | null): Lead {
  if (typeof a !== 'number' || typeof b !== 'number') return 'none';
  if (a === b) return 'tie';
  const aWins = field.direction === 'lower' ? a < b : a > b;
  return aWins ? 'a' : 'b';
}

/** Pure head-to-head comparison driven entirely by compareConfig (spec §11). */
export function compare(a: Component, b: Component): CompareResult {
  if (a.category !== b.category) {
    throw new Error(`Cannot compare across categories: ${a.category} vs ${b.category}`);
  }
  const cfg = getCompareConfig(a.category);
  const subA = subtypeOf(a);
  const subB = subtypeOf(b);
  const crossSubtype = a.category === 'storage' && !!subA && !!subB && subA !== subB;

  const rows: CompareRow[] = [];
  for (const field of cfg.fields) {
    if (!fieldInScope(field, subA, subB)) continue;
    const va = rawValue(a, field.key);
    const vb = rawValue(b, field.key);
    const counted = fieldCounts(field, subA, subB);
    const lead = counted ? leadOf(field, va, vb) : 'none';
    rows.push({
      key: field.key,
      label: field.label,
      unit: field.unit,
      valueA: va,
      valueB: vb,
      displayA: formatDisplay(field, va),
      displayB: formatDisplay(field, vb),
      lead,
      counted,
      direction: field.direction,
    });
  }

  // Tally — decided counted categories only.
  let tallyA = 0;
  let tallyB = 0;
  for (const r of rows) {
    if (!r.counted) continue;
    if (r.lead === 'a') tallyA++;
    else if (r.lead === 'b') tallyB++;
  }

  // Winner — higher performanceIndex; tie-break lower best-price then index (spec §3).
  const winner = pickWinner(a, b);
  const winnerComp = winner === 'a' ? a : b;
  const loserComp = winner === 'a' ? b : a;

  const deltas = buildDeltas(cfg.deltaFields, cfg.fields, winnerComp, loserComp);
  const tags = buildTags(cfg, rows, winner, subtypeOf(winnerComp));

  const scorecard: Scorecard = {
    winnerSlug: winnerComp.slug,
    loserSlug: loserComp.slug,
    tally: { a: tallyA, b: tallyB, total: tallyA + tallyB },
    deltas,
    tags,
    crossSubtype,
  };

  return { category: a.category, a, b, rows, scorecard };
}

function pickWinner(a: Component, b: Component): Side {
  if (a.performanceIndex !== b.performanceIndex) {
    return a.performanceIndex > b.performanceIndex ? 'a' : 'b';
  }
  const pa = bestPrice(a);
  const pb = bestPrice(b);
  if (pa !== null && pb !== null && pa !== pb) return pa < pb ? 'a' : 'b';
  if (pa !== null && pb === null) return 'a';
  if (pb !== null && pa === null) return 'b';
  return 'a'; // fully tied → stable
}

function buildDeltas(
  deltaFields: string[],
  fields: CompareField[],
  winner: Component,
  loser: Component,
): ScorecardDelta[] {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const out: ScorecardDelta[] = [];
  for (const key of deltaFields) {
    const field = byKey.get(key);
    if (!field) continue;
    const w = rawValue(winner, key);
    const l = rawValue(loser, key);
    if (typeof w !== 'number' || typeof l !== 'number') continue;
    const delta = formatDelta(field.deltaFormat ?? 'absolute', field, w, l);
    if (delta) out.push({ label: DELTA_LABELS[key] ?? field.label.toUpperCase(), value: delta });
    if (out.length === 3) break;
  }
  return out;
}

function signed(n: number, render: (abs: number) => string): string {
  if (n === 0) return render(0);
  return n > 0 ? `+${render(n)}` : `${MINUS}${render(Math.abs(n))}`;
}

function formatDelta(
  fmt: DeltaFormat,
  field: CompareField,
  winnerVal: number,
  loserVal: number,
): string | null {
  const diff = winnerVal - loserVal;
  if (diff === 0) return null;
  if (fmt === 'percent') {
    if (loserVal === 0) return null;
    const pct = (diff / loserVal) * 100;
    return signed(pct, (n) => `${n.toFixed(1)}%`);
  }
  if (fmt === 'currency') {
    return signed(diff, (n) => `$${formatNumber(Math.round(n))}`);
  }
  // absolute
  const unit = field.unit ? ` ${field.unit}` : '';
  return signed(diff, (n) => `${formatNumber(n)}${unit}`);
}

function buildTags(
  cfg: ReturnType<typeof getCompareConfig>,
  rows: CompareRow[],
  winner: Side,
  winnerSubtype: StorageSubtype | undefined,
): string[] {
  const leadByKey = new Map(rows.map((r) => [r.key, r.lead]));
  const tags: string[] = [];
  for (const rule of cfg.tags) {
    if (rule.requiresSubtype && rule.requiresSubtype !== winnerSubtype) continue;
    const checks = rule.fields.map((k) => leadByKey.get(k) === winner);
    const ok = rule.mode === 'allLead' ? checks.every(Boolean) : checks.some(Boolean);
    if (ok && !tags.includes(rule.tag)) tags.push(rule.tag);
  }
  return tags;
}
