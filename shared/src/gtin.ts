/**
 * GTIN (Global Trade Item Number) helpers — the retailer/Icecat join key.
 * Validates GTIN-8/12/13/14 length + the mod-10 check digit so a malformed or
 * fabricated barcode can never enter the catalogue. Pure + dependency-free.
 */

/** Digits-only, trimmed. Returns '' for anything without digits. */
export function normalizeGtin(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  return String(raw).replace(/\D/g, '');
}

/** GS1 mod-10 check digit over all but the last digit. */
function checkDigit(digitsNoCheck: string): number {
  let sum = 0;
  // Rightmost of the payload gets weight 3, then alternate 1,3,3,1…
  const reversed = digitsNoCheck.split('').reverse();
  for (let i = 0; i < reversed.length; i++) {
    const d = reversed[i]!.charCodeAt(0) - 48;
    sum += d * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** True when `value` is a structurally valid GTIN-8/12/13/14 with a good check digit. */
export function isValidGtin(value: string | number | null | undefined): boolean {
  const g = normalizeGtin(value);
  if (![8, 12, 13, 14].includes(g.length)) return false;
  const body = g.slice(0, -1);
  const check = g.charCodeAt(g.length - 1) - 48;
  return checkDigit(body) === check;
}

/** Reason a GTIN is rejected (for worklist reporting), or null when valid. */
export function gtinError(value: string | number | null | undefined): string | null {
  const g = normalizeGtin(value);
  if (g === '') return 'empty';
  if (![8, 12, 13, 14].includes(g.length)) return `bad length ${g.length} (need 8/12/13/14)`;
  if (!isValidGtin(g)) return 'check-digit mismatch';
  return null;
}
