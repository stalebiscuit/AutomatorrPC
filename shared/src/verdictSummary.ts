/**
 * Deterministic verdict explanation (replaces the placeholder "AI verdict").
 * Reads the compared rows + scorecard and writes a short, human sentence about
 * WHY the winner wins — which specs it leads, and where the loser pulls ahead.
 * Pure + dependency-free so it's testable and reusable (client + server).
 */
import type { CompareResult, CompareRow } from './types.js';

const BRAND_RE =
  /^(Intel|AMD|NVIDIA|Samsung|Corsair|G\.SKILL|Kingston|Crucial|Seagate|WD|Western Digital|ASUS|MSI|Gigabyte|Noctua|be quiet!|Fractal Design|Lian Li|NZXT|Seasonic|DeepCool|Thermalright|Arctic|Cooler Master|Dell|LG|Sony)\s+/i;

/** Trim a leading brand word for a tighter name (e.g. "Intel Core i9…" → "Core i9…"). */
export function trimBrand(name: string): string {
  return name.replace(BRAND_RE, '');
}

/** Natural-language list join: ["a","b","c"] → "a, b and c". */
function joinList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Relative gap of a numeric row, used to order "most decisive" advantages first. */
function magnitude(r: CompareRow): number {
  const va = Number(r.valueA);
  const vb = Number(r.valueB);
  if (!Number.isFinite(va) || !Number.isFinite(vb)) return 0;
  const lo = Math.min(Math.abs(va), Math.abs(vb));
  return lo === 0 ? Math.abs(va - vb) : Math.abs(va - vb) / lo;
}

/**
 * Write a 1–2 sentence explanation of the result. Deterministic: same inputs
 * always produce the same prose, grounded only in the counted spec rows.
 */
export function summarizeVerdict(result: CompareResult): string {
  const { a, b, rows, scorecard } = result;
  const winnerIsA = scorecard.winnerSlug === a.slug;
  const winner = winnerIsA ? a : b;
  const loser = winnerIsA ? b : a;
  const winSide = winnerIsA ? 'a' : 'b';
  const loseSide = winnerIsA ? 'b' : 'a';
  const winnerName = trimBrand(winner.name);
  const loserName = trimBrand(loser.name);
  const winCount = winnerIsA ? scorecard.tally.a : scorecard.tally.b;
  const loseCount = winnerIsA ? scorecard.tally.b : scorecard.tally.a;
  const total = scorecard.tally.total;

  const counted = rows.filter((r) => r.counted);
  const winLeads = counted
    .filter((r) => r.lead === winSide)
    .sort((x, y) => magnitude(y) - magnitude(x));
  const loseLeads = counted
    .filter((r) => r.lead === loseSide)
    .sort((x, y) => magnitude(y) - magnitude(x));

  const labels = (arr: CompareRow[], n: number): string[] =>
    arr.slice(0, n).map((r) => r.label.toLowerCase());

  let head: string;
  if (total === 0) {
    head = `${winnerName} takes it`;
  } else if (winCount > loseCount) {
    head = `${winnerName} wins ${winCount} of ${total} measured categories`;
  } else if (winCount === loseCount) {
    head = `${winnerName} edges a ${winCount}–${loseCount} split`;
  } else {
    // Won overall (higher performance index / cheaper) despite fewer field wins.
    head = `${winnerName} takes the overall win`;
  }

  const wl = labels(winLeads, 3);
  const body = wl.length ? `${head}, leading on ${joinList(wl)}.` : `${head}.`;

  const ll = labels(loseLeads, 2);
  const tail = ll.length ? ` The ${loserName} only pulls ahead on ${joinList(ll)}.` : '';

  return body + tail;
}
