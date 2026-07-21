/**
 * DB-7: extend the catalogue back to 2014-era platforms.
 *
 *   npm run db7:legacy --workspace server
 *   npm run seed       --workspace server   # re-ingest so the DB picks it up
 *
 * Adds (all idempotent — safe to re-run):
 *   1. Legacy CPUs  → cpu.json   (Intel LGA 1150/1151/2011-v3/2066, AMD AM3+ & Ryzen 1000/2000)
 *   2. Legacy boards → motherboard.json (one+ per socket, incl. the AM4 / LGA 1200 that were missing)
 *   3. Broadens cooler socketSupport so modern towers/AIOs also list the legacy sockets
 *   4. Queues the new CPU rows in docs/gtin-worklist.csv for later GTIN sourcing
 *
 * fallbackUbRaw is derived from PassMark CPU Mark on the SAME scale as the existing
 * seed (Intel i5-13600K = 122 → PassMark 37,478 ⇒ 307.2 PassMark points per ub unit),
 * so new parts score consistently through normaliseIndex().
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { logger } from '../lib/logger.js';

const SEED_DIR = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const DATA_DIR = path.join(SEED_DIR, 'data');
const REPO_ROOT = path.resolve(SEED_DIR, '../../..');

const PM_PER_UB = 307.2; // PassMark CPU Mark points per 1 ubRaw unit (calibrated to existing seed)
const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const brandImage = (brand: string): string =>
  brand === 'Intel' ? '/images/brand/intel.svg' : '/images/brand/amd.svg';
const specUrl = (brand: string): string =>
  brand === 'Intel' ? 'https://ark.intel.com/' : 'https://www.amd.com/en/products/specifications/processors';

/** [brand, model, cores, threads, base, boost, l3, tdp, socket, igpu, year, passmark] */
type Cpu = [string, string, number, number, number, number, number, number, string, string, number, number];

const CPUS: Cpu[] = [
  // Intel LGA 1150 — Haswell Refresh / Devil's Canyon (2014)
  ['Intel', 'Core i5-4460', 4, 4, 3.2, 3.4, 6, 84, 'LGA 1150', 'Intel HD Graphics 4600', 2014, 4900],
  ['Intel', 'Core i5-4590', 4, 4, 3.3, 3.7, 6, 84, 'LGA 1150', 'Intel HD Graphics 4600', 2014, 5300],
  ['Intel', 'Core i5-4690K', 4, 4, 3.5, 3.9, 6, 88, 'LGA 1150', 'Intel HD Graphics 4600', 2014, 5450],
  ['Intel', 'Core i7-4790K', 4, 8, 4.0, 4.4, 8, 88, 'LGA 1150', 'Intel HD Graphics 4600', 2014, 7500],
  // Intel LGA 1151 — Skylake (2015) / Kaby Lake (2017) / Coffee Lake (2017-2018)
  ['Intel', 'Core i5-6600K', 4, 4, 3.5, 3.9, 6, 91, 'LGA 1151', 'Intel HD Graphics 530', 2015, 6900],
  ['Intel', 'Core i7-6700K', 4, 8, 4.0, 4.2, 8, 91, 'LGA 1151', 'Intel HD Graphics 530', 2015, 8900],
  ['Intel', 'Core i5-7600K', 4, 4, 3.8, 4.2, 6, 91, 'LGA 1151', 'Intel HD Graphics 630', 2017, 7500],
  ['Intel', 'Core i7-7700K', 4, 8, 4.2, 4.5, 8, 91, 'LGA 1151', 'Intel HD Graphics 630', 2017, 9500],
  ['Intel', 'Core i5-8400', 6, 6, 2.8, 4.0, 9, 65, 'LGA 1151', 'Intel UHD Graphics 630', 2017, 11700],
  ['Intel', 'Core i5-8600K', 6, 6, 3.6, 4.3, 9, 95, 'LGA 1151', 'Intel UHD Graphics 630', 2017, 13200],
  ['Intel', 'Core i7-8700K', 6, 12, 3.7, 4.7, 12, 95, 'LGA 1151', 'Intel UHD Graphics 630', 2017, 15000],
  ['Intel', 'Core i5-9600K', 6, 6, 3.7, 4.6, 9, 95, 'LGA 1151', 'Intel UHD Graphics 630', 2018, 12600],
  ['Intel', 'Core i7-9700K', 8, 8, 3.6, 4.9, 12, 95, 'LGA 1151', 'Intel UHD Graphics 630', 2018, 16500],
  ['Intel', 'Core i9-9900K', 8, 16, 3.6, 5.0, 16, 95, 'LGA 1151', 'Intel UHD Graphics 630', 2018, 18500],
  // Intel HEDT LGA 2011-v3 — Haswell-E (2014) / Broadwell-E (2016)
  ['Intel', 'Core i7-5820K', 6, 12, 3.3, 3.6, 15, 140, 'LGA 2011-v3', 'None', 2014, 13000],
  ['Intel', 'Core i7-5930K', 6, 12, 3.5, 3.7, 15, 140, 'LGA 2011-v3', 'None', 2014, 13500],
  ['Intel', 'Core i7-6800K', 6, 12, 3.4, 3.6, 15, 140, 'LGA 2011-v3', 'None', 2016, 13800],
  ['Intel', 'Core i7-6900K', 8, 16, 3.2, 3.7, 20, 140, 'LGA 2011-v3', 'None', 2016, 20000],
  // Intel HEDT LGA 2066 — Skylake-X (2017)
  ['Intel', 'Core i7-7820X', 8, 16, 3.6, 4.3, 11, 140, 'LGA 2066', 'None', 2017, 19000],
  ['Intel', 'Core i9-7900X', 10, 20, 3.3, 4.3, 13.75, 140, 'LGA 2066', 'None', 2017, 22000],
  // AMD AM3+ — FX "Vishera"
  ['AMD', 'FX-6300', 6, 6, 3.5, 4.1, 8, 95, 'AM3+', 'None', 2012, 4900],
  ['AMD', 'FX-8320', 8, 8, 3.5, 4.0, 8, 125, 'AM3+', 'None', 2012, 5800],
  ['AMD', 'FX-8350', 8, 8, 4.0, 4.2, 8, 125, 'AM3+', 'None', 2012, 6000],
  ['AMD', 'FX-8370', 8, 8, 4.0, 4.3, 8, 125, 'AM3+', 'None', 2014, 6400],
  ['AMD', 'FX-9590', 8, 8, 4.7, 5.0, 8, 220, 'AM3+', 'None', 2013, 7000],
  // AMD legacy AM4 — Ryzen 1000 (2017) / 2000 (2018)
  ['AMD', 'Ryzen 5 1600', 6, 12, 3.2, 3.6, 16, 65, 'AM4', 'None', 2017, 12500],
  ['AMD', 'Ryzen 7 1700', 8, 16, 3.0, 3.7, 16, 65, 'AM4', 'None', 2017, 14500],
  ['AMD', 'Ryzen 7 1800X', 8, 16, 3.6, 4.0, 16, 95, 'AM4', 'None', 2017, 15500],
  ['AMD', 'Ryzen 3 2200G', 4, 4, 3.5, 3.7, 4, 65, 'AM4', 'Radeon Vega 8', 2018, 7400],
  ['AMD', 'Ryzen 5 2400G', 4, 8, 3.6, 3.9, 4, 65, 'AM4', 'Radeon Vega 11', 2018, 9200],
  ['AMD', 'Ryzen 5 2600', 6, 12, 3.4, 3.9, 16, 65, 'AM4', 'None', 2018, 13800],
  ['AMD', 'Ryzen 5 2600X', 6, 12, 3.6, 4.2, 16, 95, 'AM4', 'None', 2018, 14800],
  ['AMD', 'Ryzen 7 2700X', 8, 16, 3.7, 4.3, 16, 105, 'AM4', 'None', 2018, 17500],
];

/** [brand, name, socket, chipset, ramType, ramSlots, maxRamSpeed, m2Slots, maxRam, formFactor] */
type Mobo = [string, string, string, string, string, number, number, number, number, string];

const MOBOS: Mobo[] = [
  // AM4 (was missing entirely) — DDR4
  ['MSI', 'MSI B450 TOMAHAWK MAX', 'AM4', 'B450', 'DDR4', 4, 3466, 1, 128, 'ATX'],
  ['ASUS', 'ASUS ROG Strix B550-F Gaming', 'AM4', 'B550', 'DDR4', 4, 4400, 2, 128, 'ATX'],
  ['Gigabyte', 'Gigabyte X470 AORUS Ultra Gaming', 'AM4', 'X470', 'DDR4', 4, 3600, 2, 64, 'ATX'],
  // LGA 1200 (was missing entirely) — 10th/11th gen, DDR4
  ['ASUS', 'ASUS TUF Gaming B560M-Plus WiFi', 'LGA 1200', 'B560', 'DDR4', 4, 5000, 2, 128, 'Micro-ATX'],
  ['MSI', 'MSI MAG B460 Tomahawk', 'LGA 1200', 'B460', 'DDR4', 4, 2933, 2, 128, 'ATX'],
  ['ASUS', 'ASUS ROG Strix Z590-E Gaming WiFi', 'LGA 1200', 'Z590', 'DDR4', 4, 5333, 3, 128, 'ATX'],
  // LGA 1150 — Haswell, DDR3
  ['ASUS', 'ASUS H97-PLUS', 'LGA 1150', 'H97', 'DDR3', 4, 1600, 0, 32, 'ATX'],
  ['MSI', 'MSI Z97 GAMING 5', 'LGA 1150', 'Z97', 'DDR3', 4, 1866, 1, 32, 'ATX'],
  // LGA 1151 — Skylake / Kaby / Coffee Lake, DDR4
  ['ASUS', 'ASUS PRIME Z370-A', 'LGA 1151', 'Z370', 'DDR4', 4, 4000, 2, 64, 'ATX'],
  ['MSI', 'MSI Z170A GAMING PRO', 'LGA 1151', 'Z170', 'DDR4', 4, 3600, 1, 64, 'ATX'],
  ['Gigabyte', 'Gigabyte B360M DS3H', 'LGA 1151', 'B360', 'DDR4', 4, 2666, 2, 64, 'Micro-ATX'],
  // LGA 2011-v3 — Haswell-E / Broadwell-E, DDR4 (quad-channel, 8 slots)
  ['ASUS', 'ASUS X99-A II', 'LGA 2011-v3', 'X99', 'DDR4', 8, 3333, 1, 128, 'ATX'],
  ['MSI', 'MSI X99A GAMING PRO CARBON', 'LGA 2011-v3', 'X99', 'DDR4', 8, 3466, 1, 128, 'ATX'],
  // LGA 2066 — Skylake-X, DDR4
  ['ASUS', 'ASUS PRIME X299-A', 'LGA 2066', 'X299', 'DDR4', 8, 4133, 2, 128, 'ATX'],
  // LGA 1851 — Arrow Lake (Core Ultra 200S). Boards were missing though 3 CPUs already used this socket.
  ['ASUS', 'ASUS ROG Strix Z890-A Gaming WiFi', 'LGA 1851', 'Z890', 'DDR5', 4, 8000, 4, 256, 'ATX'],
  ['MSI', 'MSI MAG Z890 Tomahawk WiFi', 'LGA 1851', 'Z890', 'DDR5', 4, 8400, 4, 256, 'ATX'],
  // AM3+ — FX platform, DDR3
  ['ASUS', 'ASUS M5A97 R2.0', 'AM3+', '970', 'DDR3', 4, 1866, 0, 32, 'ATX'],
  ['Gigabyte', 'Gigabyte GA-990FXA-UD3', 'AM3+', '990FX', 'DDR3', 4, 1866, 0, 32, 'ATX'],
];

/**
 * DDR3 kits so the DDR3-era boards (LGA 1150 Haswell, AM3+ FX) have compatible memory.
 * fallbackUbRaw uses the same DDR3 proxy as DB-5 (speedMTs / 1600 * 45), on the RAM
 * reference scale (DDR5-5600 = 161). [brand, name, csvModel, capacity, speedMTs, cas, kitConfig, voltage]
 */
type Ram = [string, string, string, number, number, number, string, number];
const RAMS: Ram[] = [
  ['Corsair', 'Corsair Vengeance DDR3-1600 CL10 16GB (2×8GB)', 'Vengeance DDR3 1600 C10 2x8GB', 16, 1600, 10, '2 × 8 GB', 1.5],
  ['G.SKILL', 'G.Skill Ripjaws X DDR3-1866 CL10 16GB (2×8GB)', 'Ripjaws X DDR3 1866 C10 2x8GB', 16, 1866, 10, '2 × 8 GB', 1.5],
  ['Crucial', 'Crucial Ballistix Sport DDR3-1600 CL9 8GB (2×4GB)', 'Ballistix Sport DDR3 1600 C9 2x4GB', 8, 1600, 9, '2 × 4 GB', 1.5],
  ['Kingston', 'Kingston HyperX Fury DDR3-1866 CL10 8GB (2×4GB)', 'HyperX Fury DDR3 1866 C10 2x4GB', 8, 1866, 10, '2 × 4 GB', 1.5],
];

/**
 * Legacy desktop sockets to add to any cooler that already lists the modern default set.
 * Tokens are chosen so normalizeSocket() matches the CPU socket strings exactly
 * (e.g. "LGA2011-v3" → "lga2011v3" matches CPU socket "LGA 2011-v3").
 */
const LEGACY_COOLER_SOCKETS = ['LGA1150', 'LGA1151', 'LGA1155', 'LGA2011-v3', 'LGA2066', 'AM3+'];
/** Earlier draft tokens that don't normalize-match any CPU socket — strip if present. */
const DEPRECATED_COOLER_SOCKETS = new Set(['LGA2011', 'LGA2011-3']);

interface Doc { category: string; components: Array<{ slug: string; specs?: Record<string, unknown> }> }
const load = (file: string): Doc => JSON.parse(readFileSync(path.join(DATA_DIR, file), 'utf8')) as Doc;
const save = (file: string, doc: Doc): void => writeFileSync(path.join(DATA_DIR, file), JSON.stringify(doc, null, 2) + '\n');

function addCpus(): number {
  const doc = load('cpu.json');
  const have = new Set(doc.components.map((c) => c.slug));
  let added = 0;
  for (const [brand, model, cores, threads, base, boost, l3, tdp, socket, igpu, year, pm] of CPUS) {
    const name = `${brand} ${model}`;
    const slug = slugify(name);
    if (have.has(slug)) continue;
    const fallbackUbRaw = Math.round((pm / PM_PER_UB) * 10) / 10;
    doc.components.push({
      brand,
      name,
      slug,
      imageUrl: brandImage(brand),
      csv: { type: 'CPU', model },
      fallbackUbRaw,
      specs: {
        cores, threads, baseClock: base, boostClock: boost, l3Cache: l3,
        tdp, socket, igpu, releaseYear: year, passmarkCpuMark: pm,
      },
      specSourceUrl: specUrl(brand),
      unknownFields: [],
      prices: [],
    } as never);
    added += 1;
  }
  save('cpu.json', doc);
  return added;
}

function addMobos(): number {
  const doc = load('motherboard.json');
  const have = new Set(doc.components.map((c) => c.slug));
  let added = 0;
  for (const [brand, name, socket, chipset, ramType, ramSlots, maxRamSpeed, m2Slots, maxRam, formFactor] of MOBOS) {
    const slug = slugify(name);
    if (have.has(slug)) continue;
    doc.components.push({
      brand,
      name,
      slug,
      imageUrl: null,
      specs: { socket, chipset, ramType, ramSlots, maxRamSpeed, m2Slots, maxRam, formFactor },
      specSourceUrl: `https://www.google.com/search?q=${encodeURIComponent(name + ' specifications')}`,
      unknownFields: [],
      prices: [],
    } as never);
    added += 1;
  }
  save('motherboard.json', doc);
  return added;
}

function addRam(): number {
  const doc = load('ram.json');
  const have = new Set(doc.components.map((c) => c.slug));
  let added = 0;
  for (const [brand, name, csvModel, capacity, speedMTs, casLatency, kitConfig, voltage] of RAMS) {
    const slug = slugify(name);
    if (have.has(slug)) continue;
    const fallbackUbRaw = Math.round((speedMTs / 1600) * 45 * 10) / 10;
    doc.components.push({
      brand,
      name,
      slug,
      imageUrl: null,
      csv: { type: 'RAM', model: csvModel },
      fallbackUbRaw,
      specs: { capacity, speedMTs, casLatency, kitConfig, voltage, type: 'DDR3', color: 'Black' },
      specSourceUrl: `https://www.google.com/search?q=${encodeURIComponent(name + ' specifications')}`,
      unknownFields: [],
      prices: [],
    } as never);
    added += 1;
  }
  save('ram.json', doc);
  return added;
}

function broadenCoolers(): number {
  const doc = load('cooler.json');
  let changed = 0;
  for (const c of doc.components) {
    const spec = c.specs as Record<string, unknown> | undefined;
    const support = typeof spec?.socketSupport === 'string' ? spec.socketSupport : '';
    // Only touch coolers on the modern default set (they ship broad multi-socket brackets).
    if (!support.includes('LGA1700')) continue;
    const list = support.split(',').map((s) => s.trim()).filter(Boolean);
    const set = new Set(list);
    let touched = false;
    for (const s of DEPRECATED_COOLER_SOCKETS) if (set.has(s)) { set.delete(s); touched = true; }
    for (const s of LEGACY_COOLER_SOCKETS) if (!set.has(s)) { set.add(s); touched = true; }
    if (touched) { spec!.socketSupport = [...set].join(','); changed += 1; }
  }
  save('cooler.json', doc);
  return changed;
}

function queueGtins(): number {
  const file = path.join(REPO_ROOT, 'docs', 'gtin-worklist.csv');
  if (!existsSync(file)) return 0;
  const text = readFileSync(file, 'utf8');
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const haveSlugs = new Set(
    lines.slice(1).filter((l) => l.trim()).map((l) => l.split(',')[1]),
  );
  const rows: string[] = [];
  for (const [brand, model] of CPUS) {
    const name = `${brand} ${model}`;
    const slug = slugify(name);
    if (haveSlugs.has(slug)) continue;
    rows.push(`cpu,${slug},${brand},${name},,,,needs-sourcing`);
  }
  if (rows.length) {
    const out = text.replace(/\n*$/, '') + '\n' + rows.join('\n') + '\n';
    writeFileSync(file, out);
  }
  return rows.length;
}

function main(): void {
  const cpus = addCpus();
  const mobos = addMobos();
  const rams = addRam();
  const coolers = broadenCoolers();
  const gtins = queueGtins();
  logger.info(`[db7] cpu.json          +${cpus} legacy CPUs`);
  logger.info(`[db7] motherboard.json  +${mobos} legacy boards (incl. previously-missing AM4 / LGA 1200)`);
  logger.info(`[db7] ram.json          +${rams} DDR3 kits (for LGA 1150 / AM3+ boards)`);
  logger.info(`[db7] cooler.json       broadened socketSupport on ${coolers} coolers (+${LEGACY_COOLER_SOCKETS.join(',')})`);
  logger.info(`[db7] gtin-worklist.csv +${gtins} CPU rows queued for GTIN sourcing`);
  logger.info('DB-7 data written. Next: npm run seed --workspace server');
}

main();
