/**
 * DB-8 step 2 — apply the catalogue fixes the audit surfaced.
 *
 *   npm run db8:fix --workspace server               # DRY RUN — prints the plan, changes nothing
 *   npm run db8:fix --workspace server -- --apply     # execute against Mongo
 *   npm run db8:fix --workspace server -- --seed       # DRY RUN over the seed JSON files
 *   npm run db8:fix --workspace server -- --seed --apply  # rewrite the seed JSON (durable — stops
 *                                                          # `npm run seed` re-introducing junk dups)
 *
 * Actions (all derived from db8Audit + the agreed colour-only-collapse policy):
 *   • MERGE  high-confidence dup clusters + review clusters that differ ONLY by a pure colour
 *            (Black/White/Silver/Grey/Pink…). Keeper keeps the most complete record; prices are
 *            unioned; gtin/image backfilled; the merged record adopts the cleanest colour-neutral
 *            name/slug; drops deleted.
 *   • KEEP   review clusters separated by lighting (RGB/ARGB) or PSU efficiency (Gold/Bronze…).
 *   • MANUAL clusters where members have different capacities (ram/storage) — never auto-merged.
 *   • DELETE junk: near-empty AND not-builder-ready parts (e.g. zalman-t8).
 *   • RENAME verbose / truncated names to the clean product name.
 *   • BACKFILL a class-default socketSupport onto any cooler missing it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILDER_CATEGORIES, validateSpecs, type BuilderCategory, type Specs } from '@automatorr/shared';
import { canonicalSlug } from './canonical.js';
import { auditCatalogue, variantTokens, type AuditPart } from './db8Audit.js';
import { logger } from '../../lib/logger.js';

export interface FullPart extends AuditPart {
  prices: Array<{ store: string; price: number; currency?: string; url: string; lastUpdated?: Date }>;
}

const FILLER_END = new Set(['with', 'and', 'for', 'the', 'series', 'to', 'of', 'a', '-']);
const DEFAULT_COOLER_SOCKETS =
  'AM5,AM4,AM3+,LGA1700,LGA1851,LGA1200,LGA1150,LGA1151,LGA1155,LGA2011-v3,LGA2066';

const MARKETING_TAILS: RegExp[] = [
  /multi[- ]?compatible tower cpu cooler.*$/i,
  /mid[- ]?tower gaming computer case.*$/i,
  /gaming computer case.*$/i,
  /\bcpu aio cooler\b.*$/i,
  /\bcpu cooler\b.*$/i,
  /\bcomputer case\b.*$/i,
  /\btower case\b.*$/i,
  /\b(uk )?psu\b\s*$/i,
  // CPU listing tail: strip from the architecture / core-count / trailing "Processor" onward
  // ("… Raptor Lake 20 Core 28 Thread Up To 5.4GHz LGA1700 - Retail Box" → "…"). The digit
  // before "core" means the brand token "Intel Core i7" is never matched.
  /\s+(?:\d+\s*[- ]?core\b|\d+\s*thread\b|\d+(?:\.\d+)?\s*ghz\b|up to\b|with wraith\b|no hsf\b|retail box\b|raptor lake\b|arrow lake\b|s?tr5\b|swrx8\b|processor\b|dual edition\b).*$/i,
];

// A "blurb quote" is a quote/apostrophe used to open a marketing description — always
// preceded by whitespace (e.g. Cooler ' 360mm...). An inch mark is a quote glued to a
// digit (27" QHD, 27' FHD) and must be preserved.
const BLURB_QUOTE = /\s['‘’"“”].*$/;

/** Pure colours the colour-only-collapse policy treats as the SAME product. Deliberately
 *  EXCLUDES rgb/argb/light (lighting) and gold/platinum/bronze/titanium (PSU efficiency) —
 *  those stay distinct SKUs. */
const PURE_COLOR = new Set(['black', 'white', 'silver', 'grey', 'gray', 'red', 'blue', 'green', 'pink', 'purple', 'orange']);

/** Variant markers that DO distinguish a SKU (lighting + efficiency), colours removed. Two
 *  same-identity records with the same signature differ only by colour → safe to collapse. */
const nonColourSignature = (name: string): string =>
  [...variantTokens(name)].filter((t) => !PURE_COLOR.has(t)).sort().join(' ');

const COLOR_WORD = 'black|white|silver|grey|gray|red|blue|green|pink|purple|orange';
/** Strip a trailing pure-colour tag from a colour-collapsed keeper ("… (White)", "… - Black",
 *  "… (Black/Orange)"). Only used on names whose colours were just merged away. */
export function stripColourSuffix(name: string): string {
  const colour = `(?:${COLOR_WORD})(?:\\s*/\\s*(?:${COLOR_WORD}))?`;
  const out = name
    .replace(new RegExp(`\\s*\\(\\s*${colour}\\s*\\)\\s*$`, 'i'), '')
    .replace(new RegExp(`\\s*[-–—]\\s*${colour}\\s*$`, 'i'), '')
    .replace(new RegExp(`\\s+${colour}\\s*$`, 'i'), '')
    .replace(/\s+/g, ' ')
    .trim();
  return out.length >= 3 ? out : name.trim();
}

/** Re-insert spaces the crawl dropped between glued words. Conservative: only English nouns
 *  and digit-units, and only after a lowercase letter — so all-caps model codes like
 *  "PRIME-RX9070XT" or "A850GL" are never touched. */
function repairSpacing(name: string): string {
  return name
    .replace(/(\d(?:GB|TB|W))([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z])(Case|Tower|Chamber|Modular|PCIe|Radeon|GeForce|NAS|Mid)\b/g, '$1 $2')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Shorten a verbose/truncated raw name to a clean product name (cosmetic; conservative). */
export function cleanProductName(name: string): string {
  let s = repairSpacing(name).replace(BLURB_QUOTE, ' '); // fix glued words, then cut a whitespace+quote blurb (NOT inch marks)
  for (const re of MARKETING_TAILS) s = s.replace(re, ' ');
  s = s.replace(/\bkit of \d+\b/gi, ' ').replace(/\bTechnology\b/gi, ' ').replace(/\bDIMM\b/gi, ' ');
  s = s.replace(/\(\s*\)/g, ' ').replace(/\(\d+\)/g, ' '); // "( )", "(19)", "(2023)"
  s = s.replace(/\s+/g, ' ').replace(/[\s,-]+$/g, '').trim();
  const toks = s.split(' ');
  while (toks.length > 1 && FILLER_END.has((toks[toks.length - 1] ?? '').toLowerCase())) toks.pop();
  const cleaned = toks.join(' ').trim();
  return cleaned.length >= 3 ? cleaned : name.trim();
}

/** Does this name look verbose/truncated enough to warrant a rename? */
export function needsRename(name: string): boolean {
  const t = name.trim().toLowerCase().split(/\s+/);
  const last = t[t.length - 1] ?? '';
  return name.length > 70 || FILLER_END.has(last) || BLURB_QUOTE.test(name);
}

/** Review cluster (colour-only-collapse policy): merge when the members share the same
 *  non-colour signature — i.e. they differ ONLY by a pure colour (Black/White/Silver…).
 *  Members that differ by lighting (RGB/ARGB) or PSU efficiency (Gold/Bronze…) stay distinct.
 *  Assumes same-identity input (as within an identity-color cluster). */
export function reviewMergeAction(names: string[]): 'merge' | 'keep' {
  if (names.length < 2) return 'keep';
  const sigs = names.map(nonColourSignature);
  return sigs.every((s) => s === sigs[0]) ? 'merge' : 'keep';
}

/** Capacity in GB from specs, else parsed from the name ("1 TB" → 1000). null = unknown. */
const cap = (p: FullPart): number | null => {
  if (typeof p.specs.capacity === 'number') return p.specs.capacity;
  const n = Number(p.specs.capacity);
  if (n) return n;
  const m = p.name.match(/(\d+(?:\.\d+)?)\s*(tb|gb)\b/i);
  if (m) return Math.round(Number(m[1]) * (/tb/i.test(m[2]!) ? 1000 : 1));
  return null;
};

/** Pick the record to keep within a group: builder-ready → has-image → most prices → shortest name. */
function pickKeeperLocal(parts: FullPart[]): FullPart {
  return [...parts].sort((a, b) => {
    const ar = validateSpecs(a.category, a.specs).builderReady ? 1 : 0;
    const br = validateSpecs(b.category, b.specs).builderReady ? 1 : 0;
    if (ar !== br) return br - ar;
    const aspec = Object.keys(a.specs ?? {}).length;
    const bspec = Object.keys(b.specs ?? {}).length;
    if (aspec !== bspec) return bspec - aspec; // richer specs win
    const ai = a.imageUrl ? 1 : 0;
    const bi = b.imageUrl ? 1 : 0;
    if (ai !== bi) return bi - ai;
    if (a.priceCount !== b.priceCount) return b.priceCount - a.priceCount;
    return a.name.length - b.name.length;
  })[0]!;
}

export interface MergePlan {
  category: BuilderCategory;
  keeperSlug: string;
  mergedName: string;
  mergedSlug: string;
  dropSlugs: string[];
  reason: string;
}
export interface FixPlan {
  merges: MergePlan[];
  deletions: { category: BuilderCategory; slug: string; reason: string }[];
  renames: { category: BuilderCategory; slug: string; from: string; to: string }[];
  socketBackfills: string[];
  manual: { category: BuilderCategory; slugs: string[]; reason: string }[];
}

export function planFixes(parts: FullPart[]): FixPlan {
  const bySlug = new Map(parts.map((p) => [p.slug, p]));
  // Cluster on CLEANED names so verbose Icecat records collapse onto their clean twin
  // (e.g. two "MSI MAG FORGE 100R ..." variants → one cluster instead of two renames).
  const cleanName = new Map(parts.map((p) => [p.slug, cleanProductName(p.name)]));
  const cleanedParts: FullPart[] = parts.map((p) => ({ ...p, name: cleanName.get(p.slug)! }));
  const report = auditCatalogue(cleanedParts, 'mongo');
  const plan: FixPlan = { merges: [], deletions: [], renames: [], socketBackfills: [], manual: [] };
  const willDrop = new Set<string>();

  for (const cat of report.categories) {
    for (const cl of cat.clusters) {
      const clMembers = cl.members.map((m) => bySlug.get(m.slug)!).filter(Boolean);
      if (clMembers.length < 2) continue;

      // HIGH clusters merge whole. REVIEW clusters follow the colour-only-collapse policy:
      // partition by non-colour signature (lighting/efficiency) and merge each subgroup — so
      // Black/White/Silver fold into one SKU while RGB/ARGB/Gold-vs-Bronze stay distinct.
      const groups: { grp: FullPart[]; keeper: FullPart; colour: boolean }[] = [];
      if (cl.confidence === 'high') {
        groups.push({ grp: clMembers, keeper: bySlug.get(cl.keeper)!, colour: false });
      } else {
        const bySig = new Map<string, FullPart[]>();
        for (const m of clMembers) {
          const sig = nonColourSignature(cleanName.get(m.slug)!);
          bySig.set(sig, [...(bySig.get(sig) ?? []), m]);
        }
        for (const grp of bySig.values()) if (grp.length >= 2) groups.push({ grp, keeper: pickKeeperLocal(grp), colour: true });
      }

      for (const { grp, keeper, colour } of groups) {
        // Capacity guard (ram/storage): only auto-merge when EVERY member has the SAME known
        // capacity. Unknown or differing capacity → manual (protects distinct-capacity SKUs and
        // the capacity-less benchmark reference, e.g. Samsung 990 PRO).
        if (cat.category === 'ram' || cat.category === 'storage') {
          const caps = grp.map(cap);
          const known = caps.filter((c): c is number => c != null);
          if (known.length !== caps.length || new Set(known).size > 1) {
            plan.manual.push({ category: cat.category, slugs: grp.map((m) => m.slug), reason: 'unknown or differing capacity — confirm manually' });
            continue;
          }
        }

        const drops = grp.filter((m) => m.slug !== keeper.slug);
        if (drops.length === 0) continue;
        const names = grp.map((m) => cleanName.get(m.slug)!);
        let mergedName = [...names].sort((a, b) => a.length - b.length)[0]!;
        if (colour) mergedName = stripColourSuffix(mergedName); // drop the now-redundant colour tag
        plan.merges.push({
          category: cat.category,
          keeperSlug: keeper.slug,
          mergedName,
          mergedSlug: canonicalSlug(mergedName),
          dropSlugs: drops.map((d) => d.slug),
          reason: colour ? 'review/colour' : `high/${cl.reason}`,
        });
        drops.forEach((d) => willDrop.add(d.slug));
      }
    }

    // Junk: near-empty AND not builder-ready.
    for (const p of parts.filter((x) => x.category === cat.category)) {
      if (willDrop.has(p.slug)) continue;
      const empty = Object.keys(p.specs ?? {}).length < 2;
      const notReady = !validateSpecs(cat.category, p.specs).builderReady;
      if (empty && notReady) plan.deletions.push({ category: cat.category, slug: p.slug, reason: 'near-empty + not builder-ready' });
    }

    // Renames (skip anything being dropped or already a merge keeper with a new name).
    const mergedKeepers = new Set(plan.merges.map((m) => m.keeperSlug));
    for (const p of parts.filter((x) => x.category === cat.category)) {
      if (willDrop.has(p.slug) || mergedKeepers.has(p.slug)) continue;
      if (needsRename(p.name)) {
        const to = cleanProductName(p.name);
        if (to && to !== p.name) plan.renames.push({ category: cat.category, slug: p.slug, from: p.name, to });
      }
    }

    // Cooler socketSupport backfill.
    if (cat.category === 'cooler') {
      for (const p of parts.filter((x) => x.category === 'cooler')) {
        if (willDrop.has(p.slug)) continue;
        if (!p.specs?.socketSupport) plan.socketBackfills.push(p.slug);
      }
    }
  }
  return plan;
}

function printPlan(plan: FixPlan, apply: boolean): void {
  logger.info(`DB-8 fix plan (${apply ? 'APPLY' : 'DRY RUN'}):`);
  logger.info(`  merges: ${plan.merges.length} · deletions: ${plan.deletions.length} · renames: ${plan.renames.length} · socket backfills: ${plan.socketBackfills.length} · manual: ${plan.manual.length}`);
  for (const m of plan.merges) {
    logger.info(`  MERGE [${m.category}] → "${m.mergedName}" (${m.mergedSlug})  [keep ${m.keeperSlug}, drop ${m.dropSlugs.join(', ')}]  (${m.reason})`);
  }
  for (const d of plan.deletions) logger.warn(`  DELETE [${d.category}] ${d.slug} — ${d.reason}`);
  for (const r of plan.renames) logger.info(`  RENAME [${r.category}] ${r.slug}: "${r.from}" → "${r.to}"`);
  for (const s of plan.socketBackfills) logger.info(`  SOCKETS [cooler] ${s} ← default`);
  for (const mn of plan.manual) logger.warn(`  MANUAL [${mn.category}] ${mn.slugs.join(' ~ ')} — ${mn.reason}`);
}

async function applyPlan(plan: FixPlan): Promise<void> {
  const { ComponentModel } = await import('../../models/index.js');
  const now = new Date();

  for (const m of plan.merges) {
    const keeper = await ComponentModel.findOne({ category: m.category, slug: m.keeperSlug });
    if (!keeper) continue;
    const drops = await ComponentModel.find({ category: m.category, slug: { $in: m.dropSlugs } });
    // Union prices by store (keep the lowest per store).
    const priceByStore = new Map<string, { store: string; price: number; currency: string; url: string; lastUpdated: Date }>();
    for (const src of [keeper, ...drops]) {
      for (const q of (src.prices ?? []) as Array<{ store: string; price: number; currency?: string; url: string; lastUpdated?: Date }>) {
        const cur = priceByStore.get(q.store);
        if (!cur || q.price < cur.price) priceByStore.set(q.store, { store: q.store, price: q.price, currency: q.currency ?? 'AUD', url: q.url, lastUpdated: q.lastUpdated ?? now });
      }
    }
    keeper.prices = [...priceByStore.values()] as never;
    if (!keeper.gtin) keeper.gtin = drops.find((d) => d.gtin)?.gtin ?? keeper.gtin;
    if (!keeper.imageUrl) keeper.imageUrl = drops.find((d) => d.imageUrl)?.imageUrl ?? keeper.imageUrl;
    keeper.name = m.mergedName;
    keeper.slug = m.mergedSlug;
    await ComponentModel.deleteMany({ category: m.category, slug: { $in: m.dropSlugs } });
    await keeper.save(); // save after delete so a slug that collides with a dropped one is free
  }
  for (const d of plan.deletions) await ComponentModel.deleteOne({ category: d.category, slug: d.slug });
  for (const r of plan.renames) await ComponentModel.updateOne({ category: r.category, slug: r.slug }, { $set: { name: r.to } });
  for (const s of plan.socketBackfills) await ComponentModel.updateOne({ category: 'cooler', slug: s }, { $set: { 'specs.socketSupport': DEFAULT_COOLER_SOCKETS } });
}

async function loadFullParts(): Promise<FullPart[]> {
  const { connectDb, disconnectDb } = await import('../../db.js');
  const { ComponentModel } = await import('../../models/index.js');
  await connectDb();
  const docs = await ComponentModel.find({}).lean();
  await disconnectDb();
  return docs.map((d) => ({
    category: d.category as BuilderCategory,
    brand: d.brand as string,
    name: d.name as string,
    slug: d.slug as string,
    gtin: (d.gtin as string | null) ?? null,
    imageUrl: (d.imageUrl as string | null) ?? null,
    specs: (d.specs ?? {}) as Specs,
    priceCount: Array.isArray(d.prices) ? d.prices.length : 0,
    prices: (d.prices ?? []) as FullPart['prices'],
  }));
}

// ---- seed-file mode (durable: keeps `npm run seed` from re-introducing junk) ----------

const DATA_DIR = fileURLToPath(new URL('../../seed/data/', import.meta.url));
interface SeedComp { brand: string; name: string; slug: string; gtin?: string | null; imageUrl?: string | null; specs?: Specs; prices?: FullPart['prices'] }
interface SeedDoc { category: string; components: SeedComp[] }

function loadSeedFullParts(): { parts: FullPart[]; docs: Map<BuilderCategory, { file: string; doc: SeedDoc }> } {
  const parts: FullPart[] = [];
  const docs = new Map<BuilderCategory, { file: string; doc: SeedDoc }>();
  for (const cat of BUILDER_CATEGORIES) {
    const file = path.join(DATA_DIR, `${cat}.json`);
    let doc: SeedDoc;
    try { doc = JSON.parse(readFileSync(file, 'utf8')) as SeedDoc; } catch { continue; }
    docs.set(cat, { file, doc });
    for (const c of doc.components ?? []) {
      parts.push({ category: cat, brand: c.brand, name: c.name, slug: c.slug, gtin: c.gtin ?? null, imageUrl: c.imageUrl ?? null, specs: c.specs ?? {}, priceCount: (c.prices ?? []).length, prices: c.prices ?? [] });
    }
  }
  return { parts, docs };
}

function applySeedPlan(plan: FixPlan, docs: Map<BuilderCategory, { file: string; doc: SeedDoc }>): void {
  for (const [cat, { file, doc }] of docs) {
    const bySlug = new Map(doc.components.map((c) => [c.slug, c]));
    const remove = new Set(plan.deletions.filter((d) => d.category === cat).map((d) => d.slug));
    for (const m of plan.merges.filter((mm) => mm.category === cat)) {
      const keeper = bySlug.get(m.keeperSlug);
      if (keeper) {
        const drops = m.dropSlugs.map((s) => bySlug.get(s)).filter((c): c is SeedComp => Boolean(c));
        if (!keeper.gtin) keeper.gtin = drops.find((d) => d.gtin)?.gtin ?? keeper.gtin ?? null;
        if (!keeper.imageUrl) keeper.imageUrl = drops.find((d) => d.imageUrl)?.imageUrl ?? keeper.imageUrl ?? null;
        keeper.name = m.mergedName;
        keeper.slug = m.mergedSlug;
      }
      m.dropSlugs.forEach((s) => remove.add(s));
    }
    for (const r of plan.renames.filter((rr) => rr.category === cat)) {
      const c = bySlug.get(r.slug);
      if (c) c.name = r.to;
    }
    if (cat === 'cooler') {
      for (const s of plan.socketBackfills) {
        const c = bySlug.get(s);
        if (c) (c.specs ??= {}).socketSupport = DEFAULT_COOLER_SOCKETS;
      }
    }
    doc.components = doc.components.filter((c) => !remove.has(c.slug));
    writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const seedMode = process.argv.includes('--seed');

  if (seedMode) {
    const { parts, docs } = loadSeedFullParts();
    const plan = planFixes(parts);
    printPlan(plan, apply);
    if (apply) {
      applySeedPlan(plan, docs);
      logger.info('Seed JSON cleaned. Re-run `npm run catalog:check` to confirm, then `npm run seed`.');
    } else {
      logger.info('Dry run only — re-run with `-- --seed --apply` to rewrite the seed JSON.');
    }
    return;
  }

  const parts = await loadFullParts();
  const plan = planFixes(parts);
  printPlan(plan, apply);
  if (apply) {
    const { connectDb, disconnectDb } = await import('../../db.js');
    await connectDb();
    await applyPlan(plan);
    await disconnectDb();
    logger.info('DB-8 fixes applied. Re-run `npm run db8:audit` to confirm a clean catalogue.');
  } else {
    logger.info('Dry run only — re-run with `-- --apply` to execute.');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    logger.error('db8:fix failed', err);
    process.exitCode = 1;
  });
}
