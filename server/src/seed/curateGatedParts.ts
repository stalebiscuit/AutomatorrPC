/**
 * Curate a popular flagship subset from the Mwave list for the builder-only
 * categories Icecat gating hit hardest (PSU / cooler / case). Derives specs from
 * the product name, picks brand-diverse flagships, and appends builder-ready
 * entries to the seed JSON. No benchmark needed (these aren't UB-scored).
 *
 *   npm run curate:gated --workspace server
 *
 * Compatibility fields that can't be read from a name (case clearances, cooler
 * socket list) get sensible class-based DEFAULTS — approximate, refine later.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { BuilderCategory, Specs } from '@automatorr/shared';
import { validateSpecs } from '@automatorr/shared';
import { canonicalSlug } from '../services/catalog/canonical.js';
import { logger } from '../lib/logger.js';

const SEED_DIR = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const DATA_DIR = path.join(SEED_DIR, 'data');
const CAT_MAP: Record<string, BuilderCategory> = { PSU: 'psu', 'CPU Cooler': 'cooler', Case: 'case' };

/** Matched brand-prefix → proper display brand. */
const DISPLAY_BRAND: Record<string, string> = {
  'cooler master': 'Cooler Master', 'be quiet': 'be quiet!', 'lian li': 'Lian Li',
  'id-cooling': 'ID-COOLING', endorfy: 'ENDORFY', silverstone: 'SilverStone',
  'super flower': 'Super Flower', fsp: 'FSP', nzxt: 'NZXT', msi: 'MSI', evga: 'EVGA',
  asus: 'ASUS', fractal: 'Fractal Design',
};
const displayBrand = (key: string): string =>
  DISPLAY_BRAND[key] ?? key.replace(/\b\w/g, (c) => c.toUpperCase());

/** Major brands worth representing per category (name-prefix, lowercased). */
const MAJOR: Record<BuilderCategory, string[]> = {
  psu: ['corsair', 'seasonic', 'evga', 'thermaltake', 'be quiet', 'cooler master', 'msi', 'gigabyte', 'asus', 'nzxt', 'silverstone', 'cougar', 'fsp', 'super flower', 'deepcool', 'lian li'],
  cooler: ['noctua', 'be quiet', 'deepcool', 'thermalright', 'arctic', 'cooler master', 'nzxt', 'corsair', 'lian li', 'scythe', 'id-cooling', 'msi', 'thermaltake', 'endorfy'],
  case: ['fractal', 'nzxt', 'lian li', 'corsair', 'cooler master', 'phanteks', 'be quiet', 'montech', 'antec', 'thermaltake', 'silverstone', 'asus', 'msi', 'deepcool', 'hyte', 'jonsbo'],
  cpu: [], gpu: [], ram: [], storage: [], monitor: [], motherboard: [],
};
const PER_BRAND = 5;

const num = (s: string, re: RegExp): number | undefined => {
  const m = s.match(re);
  return m ? Number(m[1]) : undefined;
};

const STD_WATTS = new Set([450, 500, 550, 600, 650, 700, 750, 800, 850, 1000, 1050, 1200, 1300, 1500, 1600]);
function derivePsu(name: string): Specs {
  const s: Specs = {};
  let w = num(name, /(\d{3,4})\s?w\b/i);
  if (!w) {
    // Models embed wattage without a "W" (RM750e, Focus GX-650, SF750).
    for (const m of name.matchAll(/(\d{3,4})/g)) {
      const n = Number(m[1]);
      if (STD_WATTS.has(n)) { w = n; break; }
    }
  }
  if (w) s.wattage = w;
  const eff = name.match(/\b(titanium|platinum|gold|bronze|white)\b/i);
  if (eff) s.efficiency = `80+ ${eff[1]![0]!.toUpperCase()}${eff[1]!.slice(1).toLowerCase()}`;
  s.modular = /fully modular|full modular|\bmodular\b/i.test(name) ? 'Full' : /semi/i.test(name) ? 'Semi' : 'Non';
  s.formFactor = /\bsfx-?l?\b/i.test(name) ? 'SFX' : 'ATX';
  return s;
}

function deriveCooler(name: string): Specs {
  const s: Specs = {};
  const isAio = /aio|liquid|kraken|coreliquid|freezer (ii|iii|240|280|360|420)|silent loop|masterliquid|galahad|水冷|\b(240|280|360|420)\s?mm\b|elite (240|360)|frozen/i.test(name);
  s.type = isAio ? 'aio' : 'air';
  // Modern coolers broadly cover current + legacy sockets via bundled brackets — default (approximate).
  s.socketSupport = 'AM5,AM4,AM3+,LGA1700,LGA1851,LGA1200,LGA1150,LGA1151,LGA1155,LGA2011-v3,LGA2066';
  if (isAio) {
    s.radiatorSize = num(name, /\b(120|240|280|360|420)\b/) ?? 360;
  } else {
    s.height = num(name, /(\d{2,3})\s?mm/) ?? 158; // typical dual-tower height
  }
  return s;
}

function deriveCase(name: string): Specs {
  const s: Specs = {};
  const itx = /\bitx\b|mini-itx|nr200|a4|sff|ncase/i.test(name);
  const matx = /\bmatx\b|micro-?atx|m-atx/i.test(name);
  if (itx) {
    s.formFactorSupport = 'Mini-ITX';
    s.maxGpuLength = 330;
    s.maxCoolerHeight = 67;
  } else if (matx) {
    s.formFactorSupport = 'Micro-ATX,Mini-ITX';
    s.maxGpuLength = 330;
    s.maxCoolerHeight = 160;
  } else {
    s.formFactorSupport = 'ATX,Micro-ATX,Mini-ITX'; // ATX mid/full tower default
    s.maxGpuLength = 360;
    s.maxCoolerHeight = 165;
  }
  const color = name.match(/\b(white|black|silver|grey|gray)\b/i);
  if (color) s.color = color[1]![0]!.toUpperCase() + color[1]!.slice(1).toLowerCase();
  return s;
}

const DERIVE: Partial<Record<BuilderCategory, (n: string) => Specs>> = {
  psu: derivePsu, cooler: deriveCooler, case: deriveCase,
};

interface Row { category: string; product_name: string; mpn: string; confidence: string }
function parseCsv(text: string): Row[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim());
  return lines.slice(1).map((l) => {
    const first = l.indexOf(',');
    const parts = l.split(',');
    const confidence = parts[parts.length - 1]!;
    const mpn = parts[parts.length - 2]!;
    return {
      category: l.slice(0, first),
      product_name: l.slice(first + 1, l.length - mpn.length - confidence.length - 2),
      mpn,
      confidence,
    };
  });
}

function main(): void {
  const rows = parseCsv(readFileSync(path.join(SEED_DIR, 'mwave-catalog.csv'), 'utf8'));
  const perCat: Record<string, { brand: string; name: string; slug: string; imageUrl: null; specs: Specs; specSourceUrl: string; unknownFields: string[]; prices: [] }[]> = {};
  const brandCount: Record<string, number> = {};
  const seenSlug = new Set<string>();

  for (const r of rows) {
    const category = CAT_MAP[r.category];
    if (!category || r.confidence !== 'high') continue;
    const low = r.product_name.toLowerCase();
    const brandKey = MAJOR[category].find((b) => low.startsWith(b));
    if (!brandKey) continue;
    const bcKey = `${category}:${brandKey}`;
    if ((brandCount[bcKey] ?? 0) >= PER_BRAND) continue;

    const specs = DERIVE[category]!(r.product_name);
    const v = validateSpecs(category, specs);
    if (!v.builderReady) continue; // only keep parts we can make usable

    const name = r.product_name.trim();
    const slug = canonicalSlug(name);
    if (seenSlug.has(slug)) continue;
    seenSlug.add(slug);
    brandCount[bcKey] = (brandCount[bcKey] ?? 0) + 1;
    (perCat[category] ??= []).push({
      brand: displayBrand(brandKey),
      name,
      slug,
      imageUrl: null,
      specs,
      specSourceUrl: `https://www.mwave.com.au/search?q=${encodeURIComponent(name)}`,
      unknownFields: [],
      prices: [],
    });
  }

  let total = 0;
  for (const [category, curated] of Object.entries(perCat)) {
    const file = path.join(DATA_DIR, `${category}.json`);
    const doc = JSON.parse(readFileSync(file, 'utf8')) as { category: string; components: { slug: string }[] };
    const have = new Set(doc.components.map((c) => c.slug));
    const added = curated.filter((c) => !have.has(c.slug));
    doc.components.push(...added);
    writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
    total += added.length;
    logger.info(`[curate] ${category}: +${added.length} flagship parts (now ${doc.components.length})`);
  }
  logger.info(`Curation complete — ${total} builder-ready flagship parts added across ${Object.keys(perCat).length} categories`);
}

main();
