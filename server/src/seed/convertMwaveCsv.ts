/**
 * Convert the Mwave MPN catalogue (category,product_name,mpn,confidence) into
 * Icecat enrich seeds + a curation queue for gated brands.
 *
 *   npm run mwave:convert --workspace server            # default cap 80/category
 *   npm run mwave:convert --workspace server -- 150     # cap 150/category
 *
 * Outputs:
 *   server/src/seed/icecat-seeds.json     — Open-brand, high-confidence, deduped, capped
 *   docs/gated-curation-queue.csv         — gated brands + CPUs (hand-curate these)
 *
 * Then run `npm run icecat:enrich` to populate GTIN + specs + image + colour.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { BuilderCategory } from '@automatorr/shared';
import { logger } from '../lib/logger.js';

const SEED_DIR = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const REPO_ROOT = path.resolve(SEED_DIR, '../../..');

const CAT_MAP: Record<string, BuilderCategory> = {
  Case: 'case', Storage: 'storage', RAM: 'ram', Monitor: 'monitor',
  GPU: 'gpu', 'CPU Cooler': 'cooler', PSU: 'psu', CPU: 'cpu',
};

/** Longest-prefix brand table — handles multi-word brands the raw split truncates. */
const BRANDS: Record<string, string> = {
  'cooler master': 'Cooler Master', 'western digital': 'Western Digital', 'lian li': 'Lian Li',
  'be quiet!': 'be quiet!', 'be quiet': 'be quiet!', 'fractal design': 'Fractal Design',
  'g.skill': 'G.SKILL', teamgroup: 'TeamGroup', 'team group': 'TeamGroup', silverstone: 'SilverStone',
  deepcool: 'DeepCool', asus: 'ASUS', msi: 'MSI', gigabyte: 'Gigabyte', samsung: 'Samsung',
  kingston: 'Kingston', seagate: 'Seagate', crucial: 'Crucial', corsair: 'Corsair', sandisk: 'SanDisk',
  adata: 'ADATA', geil: 'GeIL', mushkin: 'Mushkin', patriot: 'Patriot', pny: 'PNY', sapphire: 'Sapphire',
  powercolor: 'PowerColor', zotac: 'Zotac', palit: 'Palit', gainward: 'Gainward', inno3d: 'Inno3D',
  thermaltake: 'Thermaltake', thermalright: 'Thermalright', noctua: 'Noctua', arctic: 'Arctic',
  nzxt: 'NZXT', phanteks: 'Phanteks', montech: 'Montech', antec: 'Antec', evga: 'EVGA',
  seasonic: 'Seasonic', cooler: 'Cooler Master', western: 'Western Digital', lian: 'Lian Li',
  lg: 'LG', acer: 'Acer', dell: 'Dell', benq: 'BenQ', aoc: 'AOC', viewsonic: 'ViewSonic',
  hp: 'HP', intel: 'Intel', amd: 'AMD', xpg: 'XPG',
};

/** Brands that 403 on free Open Icecat → route to curation (extend as discovered). */
const GATED = new Set([
  // Confirmed 403 on free Open Icecat (extend as discovered):
  'Corsair', 'Western Digital', 'SanDisk', 'Crucial', 'AMD', 'Intel',
  'Sapphire', 'PNY', 'Xfx', 'Nvidia', 'Zotac', 'G.SKILL', 'TeamGroup', 'Patriot',
  'Lexar', 'GeIL', 'Sabrent', 'Kioxia', 'Netac', 'Cooler Master', 'NZXT', 'Lian Li',
  'Tryx', 'Fractal Design', 'Hyte', 'Phanteks', 'Thermaltake', 'Antec', 'SilverStone',
  'Seasonic', 'EVGA', 'Alphacool', 'Kolink', 'Havn', 'Azza', 'Jonsbo', 'Gamemax', 'Xilence',
]);

function brandOf(name: string): string {
  const toks = name.toLowerCase().split(/\s+/);
  for (const n of [2, 1]) {
    const key = toks.slice(0, n).join(' ');
    if (BRANDS[key]) return BRANDS[key]!;
  }
  return (toks[0] ?? '?').replace(/^\w/, (c) => c.toUpperCase());
}

interface Row { category: string; product_name: string; mpn: string; confidence: string }

function parseCsv(text: string): Row[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim());
  const header = lines[0]!.split(',');
  const idx = (k: string) => header.indexOf(k);
  const [ci, pi, mi, fi] = [idx('category'), idx('product_name'), idx('mpn'), idx('confidence')];
  return lines.slice(1).map((l) => {
    // product_name may contain commas → split into exactly 4 fields from both ends.
    const first = l.indexOf(',');
    const parts = l.split(',');
    const confidence = parts[parts.length - 1]!;
    const mpn = parts[parts.length - 2]!;
    const category = l.slice(0, first);
    const product_name = l.slice(first + 1, l.length - mpn.length - confidence.length - 2);
    return { category, product_name, mpn, confidence } as Row;
    void ci; void pi; void mi; void fi;
  });
}

// DB-1 per-category targets (the enrichable categories present in the Mwave list).
const CAP_BY_CAT: Partial<Record<BuilderCategory, number>> = {
  gpu: 110, ram: 70, storage: 85, cooler: 65, case: 65, psu: 65, monitor: 80,
};

function main(): void {
  const override = Number(process.argv[2]) || 0; // optional uniform cap
  const capFor = (c: BuilderCategory): number => override || CAP_BY_CAT[c] || 0;
  const csvPath = path.join(SEED_DIR, 'mwave-catalog.csv');
  const rows = parseCsv(readFileSync(csvPath, 'utf8'));

  const seeds: { category: BuilderCategory; id: { brand: string; productCode: string } }[] = [];
  const gatedRows: string[] = ['category,brand,product_name,mpn,confidence'];
  const seen = new Set<string>();
  const perCatCount: Record<string, number> = {};

  for (const r of rows) {
    const category = CAT_MAP[r.category];
    if (!category) continue;
    const brand = brandOf(r.product_name);
    const key = `${category}:${r.mpn}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (GATED.has(brand) || category === 'cpu') {
      gatedRows.push(`${category},${brand},"${r.product_name.replace(/"/g, '""')}",${r.mpn},${r.confidence}`);
      continue;
    }
    if (r.confidence !== 'high') continue; // enrich high-confidence first
    const cap = capFor(category);
    if (cap === 0) continue; // category not in scope for enrich (e.g. cpu → curate)
    perCatCount[category] = (perCatCount[category] ?? 0) + 1;
    if (perCatCount[category] > cap) continue;
    seeds.push({ category, id: { brand, productCode: r.mpn } });
  }

  const seedFile = path.join(SEED_DIR, 'icecat-seeds.json');
  writeFileSync(
    seedFile,
    JSON.stringify(
      {
        _note: `Generated from mwave-catalog.csv by mwave:convert (DB-1 per-category targets${override ? `, override ${override}` : ''}). Open-brand + high-confidence only. Run: npm run icecat:enrich`,
        _gated_brands: [...GATED],
        seeds,
      },
      null,
      2,
    ) + '\n',
  );
  const queueFile = path.join(REPO_ROOT, 'docs', 'gated-curation-queue.csv');
  writeFileSync(queueFile, gatedRows.join('\n') + '\n');

  logger.info(`mwave:convert — ${seeds.length} enrich seeds (DB-1 targets${override ? `, override ${override}` : ''}) → icecat-seeds.json`);
  logger.info(`  per-category: ${Object.entries(perCatCount).map(([c, n]) => `${c}:${Math.min(n, capFor(c as BuilderCategory))}`).join(' · ')}`);
  logger.info(`  ${gatedRows.length - 1} gated/CPU rows → docs/gated-curation-queue.csv (curate)`);
}

main();
