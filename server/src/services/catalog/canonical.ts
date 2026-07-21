/**
 * Canonical part identity (Task 3 §3). Deterministic normalization so the same
 * part from any source (spec provider or retailer listing) resolves to one
 * record. Pure + dependency-free → unit-testable without a DB.
 */

/** Brand synonyms → a single normalized brand token. */
const BRAND_SYNONYMS: Record<string, string> = {
  'g.skill': 'gskill',
  gskill: 'gskill',
  'g skill': 'gskill',
  nvidia: 'nvidia',
  'nvidia geforce': 'nvidia',
  amd: 'amd',
  intel: 'intel',
  asus: 'asus',
  'asus rog': 'asus',
  msi: 'msi',
  gigabyte: 'gigabyte',
  corsair: 'corsair',
  'be quiet!': 'bequiet',
  'be quiet': 'bequiet',
  seasonic: 'seasonic',
  'western digital': 'wd',
  wd: 'wd',
  samsung: 'samsung',
  'cooler master': 'coolermaster',
  'lian li': 'lianli',
  'fractal design': 'fractaldesign',
};

/** Marketing / category / socket noise dropped from model normalization. */
const NOISE_WORDS = new Set([
  'processor', 'cpu', 'gpu', 'graphics', 'card', 'video', 'desktop', 'gaming', 'gamer',
  'memory', 'ram', 'module', 'modules', 'kit', 'edition', 'retail', 'boxed', 'box', 'oem',
  'tray', 'with', 'for', 'series', 'technology', 'ready', 'new', 'genuine', 'the', 'and',
  'core', 'am5', 'am4',
]);

/** Strip identity-free fragments (core counts, GHz clocks) before tokenizing. */
function preclean(s: string): string {
  return s
    .toLowerCase()
    .replace(/\d+\s*-?\s*core/g, ' ')
    .replace(/\d+(\.\d+)?\s*ghz/g, ' ');
}

function collapse(s: string): string {
  return s.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

/** Normalize a brand to a single comparable token. */
export function normalizeBrand(brand: string): string {
  const c = collapse(brand.toLowerCase());
  if (BRAND_SYNONYMS[c]) return BRAND_SYNONYMS[c];
  const first = c.split(' ')[0] ?? c;
  return BRAND_SYNONYMS[first] ?? first;
}

/** Model tokens with brand + noise stripped (identity-bearing tokens only). */
export function modelTokens(name: string, brand?: string): string[] {
  const nb = brand ? normalizeBrand(brand) : '';
  return collapse(preclean(name))
    .split(' ')
    .filter((t) => t && t !== nb && !NOISE_WORDS.has(t));
}

/** Normalized model string (sorted tokens → order-independent). */
export function normalizeModel(name: string, brand?: string): string {
  return [...modelTokens(name, brand)].sort().join(' ');
}

/** Canonical key: category + normalized brand + normalized model. */
export function canonicalKey(brand: string, name: string, category: string): string {
  return `${category}:${normalizeBrand(brand)}:${normalizeModel(name, brand)}`;
}

/** URL-safe slug matching the existing catalogue convention. */
export function canonicalSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
