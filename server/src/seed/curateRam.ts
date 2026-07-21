/**
 * Task 5 — scale RAM depth by DECODING manufacturer part numbers from the Mwave list
 * (no re-scrape, no Icecat). Corsair / G.Skill / Kingston MPNs encode type, speed and CAS
 * latency; capacity comes from the product name. Each kit is scored with the DB-5 RAM
 * derivation (speed-based, same as enriched RAM) and written builder-ready to ram.json,
 * capped per brand/type/speed/capacity for a diverse set (not thousands of near-duplicates).
 *
 *   npm run curate:ram --workspace server
 *   npm run seed       --workspace server   # re-ingest
 *   npm run db4:images --workspace server -- --render --apply   # then source their images
 *
 * NOTE: the current Mwave snapshot is DDR4-era (no DDR5 MPNs), so this fills DDR4 depth —
 * exactly what the DB-7 legacy AM4 / LGA1200 builds need. DDR5 kits were added in DB-3.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { logger } from '../lib/logger.js';

const SEED_DIR = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const slugify = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

interface Row { category: string; name: string; mpn: string; confidence: string }
function parseRows(text: string): Row[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim());
  return lines.slice(1).map((l) => {
    const first = l.indexOf(',');
    const parts = l.split(',');
    const confidence = parts[parts.length - 1]!;
    const mpn = parts[parts.length - 2]!;
    return { category: l.slice(0, first), name: l.slice(first + 1, l.length - mpn.length - confidence.length - 2), mpn, confidence };
  });
}

interface Decoded { type: string; speedMTs: number; cas: number; modules?: number }
const genType = (g: string): string | null => (g === '5' ? 'DDR5' : g === '4' ? 'DDR4' : g === '3' ? 'DDR3' : null);
const modLetter = (ch: string): number | undefined => ({ S: 1, D: 2, T: 4, Q: 4 } as Record<string, number>)[ch];

function decodeCorsair(mpn: string): Decoded | null {
  const m = mpn.match(/^CM[A-Z](\d+)G(X[45])M(\d)[A-Z]?(\d{3,4})C(\d{2})/i);
  if (!m) return null;
  return { type: m[2]!.toUpperCase() === 'X5' ? 'DDR5' : 'DDR4', modules: Number(m[3]), speedMTs: Number(m[4]), cas: Number(m[5]) };
}
function decodeGskill(mpn: string): Decoded | null {
  let m = mpn.match(/^F([45])-?(\d{3,4})C(\d{2})([SDQT]?)/i);
  if (m) return { type: genType(m[1]!)!, speedMTs: Number(m[2]), cas: Number(m[3]), modules: modLetter(m[4]!.toUpperCase()) };
  m = mpn.match(/^F5-?(\d{3,4})J(\d{2})/i);
  if (m) return { type: 'DDR5', speedMTs: Number(m[1]), cas: Number(m[2]), modules: 2 };
  return null;
}
const KINGSTON_SPEED: Record<number, number> = {
  21: 2133, 24: 2400, 26: 2666, 29: 2933, 30: 3000, 32: 3200, 33: 3333, 34: 3466, 36: 3600,
  37: 3733, 40: 4000, 42: 4266, 44: 4400, 46: 4600, 48: 4800, 52: 5200, 56: 5600, 60: 6000, 64: 6400,
};
function decodeKingston(mpn: string): Decoded | null {
  const m = mpn.match(/^(?:KF|HX)(\d)(\d{2})C(\d{2})[A-Z0-9]{2,3}?(K(\d))?\d{1,3}$/i);
  if (!m) return null;
  const type = genType(m[1]!);
  if (!type) return null;
  const code = Number(m[2]);
  return { type, speedMTs: KINGSTON_SPEED[code] ?? code * 100, cas: Number(m[3]), modules: m[5] ? Number(m[5]) : 1 };
}

const DECODERS: Record<string, (mpn: string) => Decoded | null> = { Corsair: decodeCorsair, 'G.Skill': decodeGskill, Kingston: decodeKingston };
const brandOf = (n: string): string | null =>
  /^corsair/i.test(n) ? 'Corsair' : /^g\.?skill/i.test(n) ? 'G.Skill' : /^kingston/i.test(n) ? 'Kingston' : null;
const capFromName = (name: string): number | null => { const m = name.match(/(\d+)\s*GB/i); return m ? Number(m[1]) : null; };
const ubRaw = (t: string, s: number): number =>
  t === 'DDR5' ? Math.round((s / 5600) * 161 * 10) / 10 : t === 'DDR4' ? Math.round((s / 3200) * 95 * 10) / 10 : Math.round((s / 1600) * 45 * 10) / 10;
const lineOf = (n: string): string =>
  n.replace(/^(corsair|g\.?skill|kingston)\s+/i, '').replace(/\s*\d+\s*GB.*$/i, '').replace(/\s+/g, ' ').trim();
const validSpeed = (t: string, s: number): boolean =>
  t === 'DDR4' ? s >= 2133 && s <= 4600 : t === 'DDR3' ? s >= 1333 && s <= 2400 : s >= 4800 && s <= 8400;
const voltageFor = (t: string): number => (t === 'DDR3' ? 1.5 : 1.35);

const VALID_CAP = new Set([4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256]);
const PER_BUCKET = 3;      // per (brand, type, capacity, speed)
const PER_BRAND_TYPE = 40; // per (brand, type)

function main(): void {
  const csv = parseRows(readFileSync(path.join(SEED_DIR, 'mwave-catalog.csv'), 'utf8')).filter(
    (r) => r.category === 'RAM' && r.confidence === 'high',
  );
  const file = path.join(SEED_DIR, 'data', 'ram.json');
  const doc = JSON.parse(readFileSync(file, 'utf8')) as { category: string; components: Array<{ slug: string }> };
  const have = new Set(doc.components.map((c) => c.slug));

  const seen = new Set<string>();
  const bucket: Record<string, number> = {};
  const brandType: Record<string, number> = {};
  let added = 0;

  for (const r of csv) {
    const brand = brandOf(r.name);
    if (!brand) continue;
    const d = DECODERS[brand]!(r.mpn);
    if (!d || !d.type || !d.speedMTs || !d.cas) continue;
    const cap = capFromName(r.name);
    if (!cap || !VALID_CAP.has(cap) || !validSpeed(d.type, d.speedMTs) || d.cas < 7 || d.cas > 46) continue;
    const line = lineOf(r.name) || brand;
    if (/^(f\d|cm|kf|hx|kcp|[a-z0-9-]{10,})/i.test(line)) continue; // name is just an MPN → skip
    const key = `${brand}|${line}|${d.type}|${d.speedMTs}|${d.cas}|${cap}`;
    if (seen.has(key)) continue;
    const bt = `${brand}|${d.type}`;
    const bk = `${bt}|${cap}|${d.speedMTs}`;
    if ((bucket[bk] ?? 0) >= PER_BUCKET || (brandType[bt] ?? 0) >= PER_BRAND_TYPE) continue;

    const mods = d.modules || (cap >= 8 ? 2 : 1);
    const per = Number.isInteger(cap / mods) && cap / mods >= 4 ? cap / mods : null;
    const name = `${brand} ${line} ${d.type}-${d.speedMTs} CL${d.cas} ${cap}GB${per ? ` (${mods}×${per}GB)` : ''}`;
    const slug = slugify(name);
    seen.add(key);
    bucket[bk] = (bucket[bk] ?? 0) + 1;
    brandType[bt] = (brandType[bt] ?? 0) + 1;
    if (have.has(slug)) continue;

    doc.components.push({
      brand,
      name,
      slug,
      imageUrl: null,
      csv: { type: 'RAM', model: r.mpn },
      fallbackUbRaw: ubRaw(d.type, d.speedMTs),
      specs: {
        capacity: cap,
        speedMTs: d.speedMTs,
        casLatency: d.cas,
        kitConfig: per ? `${mods} × ${per} GB` : `${cap} GB`,
        voltage: voltageFor(d.type),
        type: d.type,
        color: 'Black',
      },
      specSourceUrl: `https://www.mwave.com.au/search?q=${encodeURIComponent(name)}`,
      unknownFields: [],
      prices: [],
    } as never);
    added += 1;
  }

  writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  const byType = Object.entries(brandType).map(([k, n]) => `${k}=${n}`).join(' · ');
  logger.info(`[curate:ram] +${added} decoded RAM kits (now ${doc.components.length}) — ${byType}`);
  logger.info('Next: npm run seed --workspace server  (then db4:images to source their photos)');
}

main();
