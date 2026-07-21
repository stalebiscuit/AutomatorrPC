/**
 * DB-3: close out spec completeness — add the high-value RAM kits the gated brands left thin.
 *
 *   npm run db3:ram --workspace server
 *   npm run seed    --workspace server   # re-ingest
 *
 * Focus = the real gaps in the existing catalogue (all prior DDR5 kits were Intel-XMP only):
 *   • AMD EXPO DDR5 (Trident Z5 Neo, Flare X5) — the AM5 sweet spot
 *   • high-capacity DDR5 (2×32 = 64GB), value DDR5-5600, high-speed DDR5-6400
 *   • a mainstream DDR4-3600 gaming kit
 *
 * fallbackUbRaw is on the existing RAM reference scale (Kingston Fury DDR5-5600 CL40 = 161),
 * set by analogy to the current kits (CL30 6000 ≈ 225, CL36 6000 ≈ 172), so ranking stays sane.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { logger } from '../lib/logger.js';

const DATA_DIR = path.resolve(fileURLToPath(new URL('.', import.meta.url)), 'data');
const slugify = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** [brand, name, csvModel, type, capacity, speedMTs, cas, kitConfig, voltage, fallbackUbRaw] */
type Ram = [string, string, string, string, number, number, number, string, number, number];

const RAMS: Ram[] = [
  // AMD EXPO DDR5 — the gap: every existing DDR5 kit was Intel XMP only
  ['G.SKILL', 'G.Skill Trident Z5 Neo RGB DDR5-6000 CL30 32GB (2×16GB)', 'Trident Z5 Neo DDR5 6000 C30 2x16GB', 'DDR5', 32, 6000, 30, '2 × 16 GB', 1.35, 226],
  ['G.SKILL', 'G.Skill Flare X5 DDR5-6000 CL30 32GB (2×16GB)', 'Flare X5 DDR5 6000 C30 2x16GB', 'DDR5', 32, 6000, 30, '2 × 16 GB', 1.35, 223],
  // High-capacity DDR5
  ['Corsair', 'Corsair Vengeance RGB DDR5-6000 CL30 64GB (2×32GB)', 'Vengeance RGB DDR5 6000 C30 2x32GB', 'DDR5', 64, 6000, 30, '2 × 32 GB', 1.35, 244],
  // Value DDR5-5600
  ['Corsair', 'Corsair Vengeance DDR5-5600 CL36 32GB (2×16GB)', 'Vengeance DDR5 5600 C36 2x16GB', 'DDR5', 32, 5600, 36, '2 × 16 GB', 1.25, 156],
  // Mainstream DDR5-6000 CL36
  ['Kingston', 'Kingston Fury Beast DDR5-6000 CL36 32GB (2×16GB)', 'Fury Beast DDR5 6000 C36 2x16GB', 'DDR5', 32, 6000, 36, '2 × 16 GB', 1.35, 173],
  // High-speed DDR5-6400
  ['G.SKILL', 'G.Skill Ripjaws S5 DDR5-6400 CL32 32GB (2×16GB)', 'Ripjaws S5 DDR5 6400 C32 2x16GB', 'DDR5', 32, 6400, 32, '2 × 16 GB', 1.40, 236],
  // Popular DDR4-3600 gaming kit
  ['Corsair', 'Corsair Vengeance LPX DDR4-3600 CL18 32GB (2×16GB)', 'Vengeance LPX DDR4 3600 C18 2x16GB', 'DDR4', 32, 3600, 18, '2 × 16 GB', 1.35, 92],
];

interface Doc { category: string; components: Array<{ slug: string }> }

function main(): void {
  const file = path.join(DATA_DIR, 'ram.json');
  const doc = JSON.parse(readFileSync(file, 'utf8')) as Doc;
  const have = new Set(doc.components.map((c) => c.slug));
  let added = 0;
  for (const [brand, name, csvModel, type, capacity, speedMTs, casLatency, kitConfig, voltage, fallbackUbRaw] of RAMS) {
    const slug = slugify(name);
    if (have.has(slug)) continue;
    doc.components.push({
      brand,
      name,
      slug,
      imageUrl: '/images/ram/ddr5.svg',
      csv: { type: 'RAM', model: csvModel },
      fallbackUbRaw,
      specs: { capacity, speedMTs, casLatency, kitConfig, voltage, type, color: 'Black' },
      specSourceUrl: `https://www.google.com/search?q=${encodeURIComponent(name + ' specifications')}`,
      unknownFields: [],
      prices: [],
    } as never);
    added += 1;
  }
  writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  logger.info(`[db3] ram.json +${added} kits (AMD EXPO DDR5, high-cap, value, DDR4-3600) — now ${doc.components.length}`);
  logger.info('DB-3 RAM written. Next: npm run seed --workspace server');
}

main();
