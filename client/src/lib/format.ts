/** AUD money formatting for the builder UI. */
export function formatAud(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * Compact spec summary line, e.g. "AM5 · 12 cores · 105 W". Optional `units`
 * appends a unit/label per spec key so bare numbers aren't ambiguous. List-type
 * values (comma-separated, e.g. a cooler's `socketSupport`) are collapsed to the
 * first two entries + a "+N" count so the long CSV never blows out the row.
 */
export function specSummary(
  specs: Record<string, string | number>,
  keys: string[],
  units: Record<string, string> = {},
): string {
  const parts: string[] = [];
  for (const k of keys) {
    const v = specs[k];
    if (v === undefined || v === '') continue;
    const raw = String(v);
    // List values get summarised and never take a unit.
    if (raw.includes(',')) {
      parts.push(summariseSpecValue(raw));
    } else {
      parts.push(raw + (units[k] ?? ''));
    }
  }
  return parts.join(' · ');
}

/** Collapse a long comma-separated list value to "a, b +N". */
function summariseSpecValue(value: string): string {
  const items = value.split(',').map((x) => x.trim()).filter(Boolean);
  if (items.length <= 2) return items.join(', ') || value;
  return `${items.slice(0, 2).join(', ')} +${items.length - 2}`;
}

/**
 * Relative price freshness, e.g. "UPDATED TODAY" / "UPDATED 3D AGO"
 * (launch-polish P3 — surfaces prices[].lastUpdated as a visible claim).
 * Returns null for missing/unparseable dates so callers can hide the badge.
 */
export function freshness(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return 'UPDATED TODAY';
  if (days === 1) return 'UPDATED 1D AGO';
  if (days < 31) return `UPDATED ${days}D AGO`;
  return null; // stale enough that advertising it would hurt, not help
}

/** Word count for input limits (launch-polish revision: 200-word caps). */
export function countWords(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Hard-cap a string to its first `max` words (whitespace preserved between). */
export function capWords(s: string, max: number): string {
  const parts = s.split(/(\s+)/); // keep separators
  let words = 0;
  let out = '';
  for (const p of parts) {
    if (/\S/.test(p)) {
      words += 1;
      if (words > max) break;
    }
    out += p;
  }
  return words > max ? out.trimEnd() : s;
}
