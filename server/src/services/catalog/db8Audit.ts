/**
 * DB-8 step 1 — read-only catalogue audit.
 *
 *   npm run db8:audit --workspace server           # audit the live Mongo catalogue
 *   npm run db8:audit --workspace server -- --seed  # audit the seed JSON files (no DB)
 *   npm run db8:audit --workspace server -- --json  # also write docs/db8-audit.json
 *
 * MUTATES NOTHING. Surfaces the four DB-8 work items so the fix pass is data-driven:
 *   1. Duplicate clusters   — same product under >1 slug (canonical-key match, shared
 *                             GTIN, or a shared distinctive model-code token)
 *   2. Junk / not-ready     — parts failing validateSpecs, near-empty specs, coolers
 *                             missing socketSupport
 *   3. Name-quality issues  — truncated names (end in a filler word) or verbose raw
 *                             Icecat names (very long)
 *   4. Compatibility coverage — every CPU socket has a cooler + motherboard; every
 *                             motherboard RAM type has at least one kit; GPU/case/PSU ranges
 */
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  BUILDER_CATEGORIES,
  validateSpecs,
  type BuilderCategory,
  type Specs,
} from '@automatorr/shared';
import { canonicalKey, normalizeBrand } from './canonical.js';
import { logger } from '../../lib/logger.js';

export interface AuditPart {
  category: BuilderCategory;
  brand: string;
  name: string;
  slug: string;
  gtin: string | null;
  imageUrl: string | null;
  specs: Specs;
  priceCount: number;
}

const norm = (s: string): string => s.replace(/[^a-z0-9]/gi, '').toLowerCase();
const FILLER_END = new Set(['with', 'and', 'for', 'the', 'series', 'to', 'of', 'a', '-']);
const VERBOSE_LEN = 70;

/**
 * Packaging / category / marketing words that never distinguish a SKU — always stripped.
 * NOTE: numbers, capacities and wattages are deliberately KEPT (they ARE the identity for
 * GPUs, RAM and PSUs), so the 'high' tier under-merges rather than risk deleting real SKUs.
 */
const PACKAGING_NOISE = new Set([
  'uk', 'us', 'eu', 'na', 'au', 'edition', 'certified', 'ready', 'genuine', 'new', 'retail', 'boxed', 'oem',
  'wifi', 'wi', 'fi', 'bt', 'aura', 'mystic', 'sync', 'tempered', 'glass', 'panel',
  'atx', 'matx', 'itx', 'micro', 'eatx', 'psu', 'power', 'supply', 'unit', 'powercord',
  'single', 'rail', 'dc', 'circuit', 'fan', 'fans', 'pwm', 'non', 'fully', 'semi', 'modular', 'sleeved',
  'cables', 'cable', 'radiator', 'pump', 'cpu', 'cooler', 'liquid', 'air', 'tower', 'case', 'chassis',
  'gaming', 'gamer', 'computer', 'desktop', 'pc', 'mid', 'full', 'compatible', 'platforms', 'platform',
  'intel', 'amd', 'and', 'with', 'for', 'the', 'to', 'of', 'efficiency', 'mount', 'bracket', 'adjustable',
  'dragon', 'multi', 'x',
]);
/** Variant markers - stripped ONLY in the 'review' tier (they distinguish real variants). */
const VARIANT_NOISE = new Set([
  'black', 'white', 'silver', 'grey', 'gray', 'red', 'blue', 'green', 'pink', 'purple', 'orange',
  'rgb', 'argb', 'light', 'gold', 'platinum', 'bronze', 'titanium',
]);

/**
 * Drop ONLY numeric parentheticals ("(19)", "(2023)") — junk parse artifacts. Worded
 * parentheticals like "(White)"/"(Black)" are kept (just unwrapped) so they stay variant
 * tokens, not silently erased into a false high-confidence duplicate.
 */
const stripJunkParens = (s: string): string => s.replace(/\(\s*\d[\d.\s]*\)/g, ' ').replace(/[()]/g, ' ');

/** Variant markers present in a name (colour / RGB / efficiency) — used to classify review merges. */
export function variantTokens(name: string): Set<string> {
  return new Set(
    stripJunkParens(name.toLowerCase()).split(/[^a-z0-9]+/).filter((t) => VARIANT_NOISE.has(t)),
  );
}

/**
 * Identity tokens for dedup grouping. 'high' strips only packaging noise + parentheticals and
 * keeps all model codes/numbers/variant markers (precise, safe to auto-merge). 'review' also
 * strips variant markers (colour/RGB/efficiency) to surface likely-but-not-certain duplicates.
 */
function identityCore(name: string, brand: string, tier: 'high' | 'review'): string {
  const b = norm(brand);
  const toks = stripJunkParens(name.toLowerCase()) // drop "(19)"/"(2023)" but keep "(White)" as a token
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((t) => t !== b && !PACKAGING_NOISE.has(t))
    .filter((t) => !(tier === 'review' && VARIANT_NOISE.has(t)));
  return [...new Set(toks)].sort().join(' ');
}

export interface Cluster {
  reason: 'canonical-key' | 'shared-gtin' | 'identity' | 'identity-color';
  confidence: 'high' | 'review';
  key: string;
  members: { slug: string; name: string; builderReady: boolean; hasImage: boolean; priceCount: number }[];
  keeper: string;
}

/** Pick the record to keep: builder-ready first, then has-image, then most prices, then shortest (cleanest) name. */
function pickKeeper(parts: AuditPart[]): string {
  return [...parts]
    .sort((a, b) => {
      const ar = validateSpecs(a.category, a.specs).builderReady ? 1 : 0;
      const br = validateSpecs(b.category, b.specs).builderReady ? 1 : 0;
      if (ar !== br) return br - ar;
      const aspec = Object.keys(a.specs ?? {}).length;
      const bspec = Object.keys(b.specs ?? {}).length;
      if (aspec !== bspec) return bspec - aspec; // richer specs win — never drop a curated part for a thin crawl decode
      const ai = a.imageUrl ? 1 : 0;
      const bi = b.imageUrl ? 1 : 0;
      if (ai !== bi) return bi - ai;
      if (a.priceCount !== b.priceCount) return b.priceCount - a.priceCount;
      return a.name.length - b.name.length;
    })[0]!.slug;
}

function clustersFor(parts: AuditPart[]): Cluster[] {
  const out: Cluster[] = [];
  const claimed = new Set<string>(); // slug already placed in a cluster

  const emit = (reason: Cluster['reason'], confidence: Cluster['confidence'], key: string, group: AuditPart[]): void => {
    const uniq = group.filter((p) => !claimed.has(p.slug));
    if (uniq.length < 2) return;
    uniq.forEach((p) => claimed.add(p.slug));
    out.push({
      reason,
      confidence,
      key,
      keeper: pickKeeper(uniq),
      members: uniq.map((p) => ({
        slug: p.slug,
        name: p.name,
        builderReady: validateSpecs(p.category, p.specs).builderReady,
        hasImage: Boolean(p.imageUrl),
        priceCount: p.priceCount,
      })),
    });
  };

  // 1. Shared GTIN — two slugs, one barcode → definitely the same product.
  const byGtin = new Map<string, AuditPart[]>();
  for (const p of parts) if (p.gtin) byGtin.set(p.gtin, [...(byGtin.get(p.gtin) ?? []), p]);
  for (const [g, group] of byGtin) emit('shared-gtin', 'high', g, group);

  // 2. Exact canonical-key collisions.
  const byKey = new Map<string, AuditPart[]>();
  for (const p of parts) {
    const k = canonicalKey(p.brand, p.name, p.category);
    byKey.set(k, [...(byKey.get(k) ?? []), p]);
  }
  for (const [k, g] of byKey) emit('canonical-key', 'high', k, g);

  // 3. HIGH: identical product identity (model codes + colour) after stripping spec/marketing noise.
  //    Catches clean-seed-name vs verbose-Icecat-name of the SAME sku (e.g. "RM750e" vs "RM750e (19)").
  const byId = new Map<string, AuditPart[]>();
  for (const p of parts) {
    const core = identityCore(p.name, p.brand, 'high');
    if (!core) continue; // all-noise name → don't group (would merge unrelated parts)
    const key = `${normalizeBrand(p.brand)}::${core}`;
    byId.set(key, [...(byId.get(key) ?? []), p]);
  }
  for (const [key, group] of byId) emit('identity', 'high', key, group);

  // 4. REVIEW: identical except colour — could be a verbose Icecat dup OR a legit colour variant.
  //    Flagged for human confirmation; never auto-merged.
  const byIdNoColor = new Map<string, AuditPart[]>();
  for (const p of parts) {
    const core = identityCore(p.name, p.brand, 'review');
    if (!core) continue;
    const key = `${normalizeBrand(p.brand)}::${core}`;
    byIdNoColor.set(key, [...(byIdNoColor.get(key) ?? []), p]);
  }
  for (const [key, group] of byIdNoColor) emit('identity-color', 'review', key, group);

  return out;
}

export interface CategoryAudit {
  category: BuilderCategory;
  total: number;
  clusters: Cluster[];
  notReady: { slug: string; missingCritical: string[] }[];
  nearEmpty: string[];
  missingSocketSupport: string[];
  nameIssues: { slug: string; issue: 'truncated' | 'verbose'; name: string }[];
}

export interface CoverageGap {
  kind: 'socket-no-cooler' | 'socket-no-mobo' | 'ramtype-no-ram';
  value: string;
  detail: string;
}

export interface AuditReport {
  source: 'mongo' | 'seed';
  generatedAt: string;
  categories: CategoryAudit[];
  coverage: CoverageGap[];
  totals: { parts: number; dupHigh: number; dupReview: number; duplicateExtras: number; notReady: number; nameIssues: number; coverageGaps: number };
}

export function auditCatalogue(parts: AuditPart[], source: 'mongo' | 'seed'): AuditReport {
  const byCat = new Map<BuilderCategory, AuditPart[]>();
  for (const p of parts) byCat.set(p.category, [...(byCat.get(p.category) ?? []), p]);

  const categories: CategoryAudit[] = [];
  for (const cat of BUILDER_CATEGORIES) {
    const rows = byCat.get(cat) ?? [];
    const notReady: CategoryAudit['notReady'] = [];
    const nearEmpty: string[] = [];
    const missingSocketSupport: string[] = [];
    const nameIssues: CategoryAudit['nameIssues'] = [];
    for (const p of rows) {
      const v = validateSpecs(cat, p.specs);
      if (!v.builderReady) notReady.push({ slug: p.slug, missingCritical: v.missingCritical });
      if (Object.keys(p.specs ?? {}).length < 2) nearEmpty.push(p.slug);
      if (cat === 'cooler' && !p.specs?.socketSupport) missingSocketSupport.push(p.slug);
      const tokens = p.name.trim().toLowerCase().split(/\s+/);
      const last = tokens[tokens.length - 1] ?? '';
      if (FILLER_END.has(last)) nameIssues.push({ slug: p.slug, issue: 'truncated', name: p.name });
      else if (p.name.length > VERBOSE_LEN) nameIssues.push({ slug: p.slug, issue: 'verbose', name: p.name });
    }
    categories.push({ category: cat, total: rows.length, clusters: clustersFor(rows), notReady, nearEmpty, missingSocketSupport, nameIssues });
  }

  // Compatibility coverage.
  const coverage: CoverageGap[] = [];
  const cpus = byCat.get('cpu') ?? [];
  const mobos = byCat.get('motherboard') ?? [];
  const coolers = byCat.get('cooler') ?? [];
  const rams = byCat.get('ram') ?? [];
  const moboSockets = new Set(mobos.map((m) => norm(String(m.specs.socket ?? ''))));
  const coolerSockets = new Set<string>();
  coolers.forEach((c) => String(c.specs.socketSupport ?? '').split(',').forEach((s) => coolerSockets.add(norm(s))));
  const cpuSockets = new Set(cpus.map((c) => String(c.specs.socket ?? '')));
  for (const s of cpuSockets) {
    const n = norm(s);
    if (!moboSockets.has(n)) coverage.push({ kind: 'socket-no-mobo', value: s, detail: `no motherboard for socket ${s}` });
    if (!coolerSockets.has(n)) coverage.push({ kind: 'socket-no-cooler', value: s, detail: `no cooler lists socket ${s}` });
  }
  const ramTypes = new Set(rams.map((r) => String(r.specs.type ?? '').toUpperCase()));
  const moboRamTypes = new Set(mobos.map((m) => String(m.specs.ramType ?? '').toUpperCase()));
  for (const t of moboRamTypes) if (t && !ramTypes.has(t)) coverage.push({ kind: 'ramtype-no-ram', value: t, detail: `motherboards need ${t} but no ${t} RAM kit exists` });

  const allClusters = categories.flatMap((c) => c.clusters);
  const dupHigh = allClusters.filter((c) => c.confidence === 'high').length;
  const dupReview = allClusters.filter((c) => c.confidence === 'review').length;
  const duplicateExtras = allClusters.filter((c) => c.confidence === 'high').reduce((m, cl) => m + cl.members.length - 1, 0);
  const notReady = categories.reduce((n, c) => n + c.notReady.length, 0);
  const nameIssues = categories.reduce((n, c) => n + c.nameIssues.length, 0);

  return {
    source,
    generatedAt: new Date().toISOString(),
    categories,
    coverage,
    totals: { parts: parts.length, dupHigh, dupReview, duplicateExtras, notReady, nameIssues, coverageGaps: coverage.length },
  };
}

// ---- loaders -------------------------------------------------------------

function loadFromSeed(): AuditPart[] {
  const DATA_DIR = fileURLToPath(new URL('../../seed/data/', import.meta.url));
  const parts: AuditPart[] = [];
  for (const cat of BUILDER_CATEGORIES) {
    let raw: { components?: Array<{ brand: string; name: string; slug: string; gtin?: string | null; imageUrl?: string | null; specs?: Specs; prices?: unknown[] }> };
    try {
      raw = JSON.parse(readFileSync(path.join(DATA_DIR, `${cat}.json`), 'utf8'));
    } catch {
      continue; // some builder-only categories may have no seed file
    }
    for (const c of raw.components ?? []) {
      parts.push({
        category: cat, brand: c.brand, name: c.name, slug: c.slug,
        gtin: c.gtin ?? null, imageUrl: c.imageUrl ?? null,
        specs: c.specs ?? {}, priceCount: (c.prices ?? []).length,
      });
    }
  }
  return parts;
}

async function loadFromMongo(): Promise<AuditPart[]> {
  const { connectDb, disconnectDb } = await import('../../db.js');
  const { ComponentModel } = await import('../../models/index.js');
  await connectDb();
  const docs = await ComponentModel.find({}).lean();
  const parts: AuditPart[] = docs.map((d) => ({
    category: d.category as BuilderCategory,
    brand: d.brand as string,
    name: d.name as string,
    slug: d.slug as string,
    gtin: (d.gtin as string | null) ?? null,
    imageUrl: (d.imageUrl as string | null) ?? null,
    specs: (d.specs ?? {}) as Specs,
    priceCount: Array.isArray(d.prices) ? d.prices.length : 0,
  }));
  await disconnectDb();
  return parts;
}

function printReport(r: AuditReport): void {
  logger.info(`DB-8 audit (${r.source}) — ${r.totals.parts} parts`);
  logger.info(
    `  dup clusters: ${r.totals.dupHigh} high (${r.totals.duplicateExtras} extra records to merge), ${r.totals.dupReview} review · ` +
      `not-ready: ${r.totals.notReady} · name issues: ${r.totals.nameIssues} · coverage gaps: ${r.totals.coverageGaps}`,
  );
  for (const c of r.categories) {
    const bits: string[] = [];
    if (c.clusters.length) bits.push(`${c.clusters.length} dup cluster(s)`);
    if (c.notReady.length) bits.push(`${c.notReady.length} not-ready`);
    if (c.nearEmpty.length) bits.push(`${c.nearEmpty.length} near-empty`);
    if (c.missingSocketSupport.length) bits.push(`${c.missingSocketSupport.length} no-socketSupport`);
    if (c.nameIssues.length) bits.push(`${c.nameIssues.length} name issue(s)`);
    logger.info(`[${c.category}] ${c.total} parts` + (bits.length ? ` — ${bits.join('; ')}` : ' — clean'));
    for (const cl of c.clusters) {
      logger.warn(`   ⧉ [${cl.confidence}] ${cl.reason} → keep ${cl.keeper}`);
      for (const m of cl.members) logger.warn(`       ${m.slug === cl.keeper ? 'keep' : 'drop'} ${m.slug}  "${m.name}"${m.builderReady ? '' : ' [not-ready]'}`);
    }
    for (const nr of c.notReady) logger.warn(`   ✗ not-ready ${nr.slug} — missing: ${nr.missingCritical.join(', ')}`);
    for (const ne of c.nearEmpty) logger.warn(`   ✗ near-empty specs: ${ne}`);
    for (const ni of c.nameIssues) logger.warn(`   ! ${ni.issue}: ${ni.slug} — "${ni.name}"`);
  }
  for (const g of r.coverage) logger.warn(`   ⚠ coverage: ${g.detail}`);
}

async function main(): Promise<void> {
  const seedMode = process.argv.includes('--seed');
  const writeJson = process.argv.includes('--json');
  const parts = seedMode ? loadFromSeed() : await loadFromMongo();
  const report = auditCatalogue(parts, seedMode ? 'seed' : 'mongo');
  printReport(report);
  if (writeJson) {
    const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
    const out = path.join(REPO_ROOT, 'docs', 'db8-audit.json');
    writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
    logger.info(`Report written → docs/db8-audit.json`);
  }
  // CI guardrail: fail the build if the catalogue has coverage gaps or not-ready parts.
  // Intended as `db8:audit --seed --ci` (no DB needed) so regressions can't merge.
  if (process.argv.includes('--ci')) {
    const blocking = report.totals.coverageGaps + report.totals.notReady;
    if (blocking > 0) {
      logger.error(`CI gate: ${report.totals.coverageGaps} coverage gap(s) + ${report.totals.notReady} not-ready part(s) — failing.`);
      process.exitCode = 1;
    } else {
      logger.info('CI gate: catalogue coverage complete, all parts builder-ready ✓');
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    logger.error('db8:audit failed', err);
    process.exitCode = 1;
  });
}
