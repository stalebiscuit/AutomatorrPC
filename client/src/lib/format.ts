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
