/**
 * Task 5 — scale storage depth by decoding capacity + interface/subtype from the Mwave
 * MPNs/names (no Icecat). Scored with the DB-5 storage tiers (Gen5 500 / Gen4 400 / Gen3
 * NVMe 250 / SATA 90 / HDD 30). Capped per brand/line/interface for a diverse set.
 *
 *   npm run curate:storage --workspace server
 *   npm run seed          --workspace server
 *   npm run db4:images    --workspace server -- --render --apply
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

const VALID_CAP = new Set([120, 240, 250, 256, 480, 500, 512, 1000, 2000, 4000, 8000]);
function capacityOf(mpn: string, name: string): number | null {
  const s = `${mpn} ${name}`.toUpperCase();
  let m = s.match(/(\d+)\s?TB\b/); if (m) return Number(m[1]) * 1000;
  m = s.match(/(\d)T0\b/); if (m) return Number(m[1]) * 1000;
  m = s.match(/WDS(\d)00T/); if (m) return Number(m[1]) * 1000;
  m = s.match(/\b(\d{3,4})\s?GB?\b/); if (m && VALID_CAP.has(Number(m[1]))) return Number(m[1]);
  m = mpn.toUpperCase().match(/(?:CT|ST|SNV\dS|P300P|SU|SP0?)(\d{3,4})/); if (m && VALID_CAP.has(Number(m[1]))) return Number(m[1]);
  return null;
}
const HDD_RE = /barracuda|ironwolf|firecuda 3\.5|skyhawk|\bhdd\b|\bST\d{4,}DM|WD\d+EZ|purple/i;
const subtypeOf = (name: string, mpn: string): 'ssd' | 'hdd' => (HDD_RE.test(`${name} ${mpn}`) ? 'hdd' : 'ssd');
function ifaceOf(name: string, mpn: string, subtype: string): string {
  const s = `${name} ${mpn}`.toUpperCase();
  if (subtype === 'hdd') return 'SATA III';
  if (/PCIE ?5|GEN ?5|SN8100|9100 ?PRO|T700|T705/.test(s)) return 'NVMe PCIe 5.0';
  if (/\bSATA\b|870 ?EVO|870 ?QVO|860|MX500|BX500|A400/.test(s)) return 'SATA III';
  return 'NVMe PCIe 4.0';
}
const ffOf = (subtype: string, iface: string): string => (subtype === 'hdd' ? '3.5"' : iface.startsWith('SATA') ? '2.5"' : 'M.2 2280');
function ubRaw(iface: string, subtype: string): number {
  const s = iface.toUpperCase();
  if (subtype === 'hdd') return 30;
  if (/PCIE 5/.test(s)) return 500;
  if (/PCIE 4/.test(s)) return 400;
  if (/NVME/.test(s)) return 250;
  return 90;
}
const capDisp = (c: number): string => (c >= 1000 ? `${c / 1000}TB` : `${c}GB`);
const brandOf = (n: string): string => (/^western digital|^wd\b/i.test(n) ? 'WD' : n.split(' ')[0]!);
function lineOf(name: string, brand: string): string {
  if (brand === 'WD') return name.replace(/^western digital\s*/i, '').replace(/^wd[_ ]?/i, '').replace(/wd_?/i, '').replace(/\s*\d+\s?(GB|TB).*$/i, '').replace(/\s+/g, ' ').trim();
  return name.replace(new RegExp('^' + brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+', 'i'), '').replace(/\s*\d+\s?(GB|TB).*$/i, '').replace(/\s+/g, ' ').trim();
}
const MAJOR = /^(samsung|crucial|kingston|western digital|wd|seagate|adata|sandisk|sabrent|lexar|corsair|teamgroup|silicon power|patriot)/i;
const PER_BUCKET = 2; // per (brand, line, interface)
const PER_BRAND = 22;

function main(): void {
  const csv = parseRows(readFileSync(path.join(SEED_DIR, 'mwave-catalog.csv'), 'utf8')).filter((r) => r.category === 'Storage' && r.confidence === 'high');
  const file = path.join(SEED_DIR, 'data', 'storage.json');
  const doc = JSON.parse(readFileSync(file, 'utf8')) as { category: string; components: Array<{ slug: string }> };
  const have = new Set(doc.components.map((c) => c.slug));
  const seen = new Set<string>();
  const bucket: Record<string, number> = {};
  let added = 0;

  for (const r of csv) {
    if (!MAJOR.test(r.name)) continue;
    const cap = capacityOf(r.mpn, r.name);
    if (!cap) continue;
    const subtype = subtypeOf(r.name, r.mpn);
    const iface = ifaceOf(r.name, r.mpn, subtype);
    const ff = ffOf(subtype, iface);
    const brand = brandOf(r.name);
    const line = lineOf(r.name, brand) || r.name;
    if (/^(mz-|ct\d|st\d|wds|snv|su\d|sp0|p300p|[a-z0-9-]{9,})/i.test(line)) continue;
    const key = `${brand}|${line}|${cap}|${iface}`;
    if (seen.has(key)) continue;
    const bk = `${brand}|${line}|${iface}`;
    if ((bucket[bk] ?? 0) >= PER_BUCKET) continue;
    const bb = `B:${brand}`;
    if ((bucket[bb] ?? 0) >= PER_BRAND) continue;
    seen.add(key);
    bucket[bk] = (bucket[bk] ?? 0) + 1;
    bucket[bb] = (bucket[bb] ?? 0) + 1;

    const name = `${brand} ${line} ${capDisp(cap)}`;
    const slug = slugify(name);
    if (have.has(slug)) continue;
    doc.components.push({
      brand,
      name,
      slug,
      imageUrl: null,
      csv: { type: subtype === 'hdd' ? 'HDD' : 'SSD', model: `${line} ${capDisp(cap)}` },
      fallbackUbRaw: ubRaw(iface, subtype),
      specs: { subtype, capacity: cap, formFactor: ff, interface: iface },
      specSourceUrl: `https://www.mwave.com.au/search?q=${encodeURIComponent(name)}`,
      unknownFields: [],
      prices: [],
    } as never);
    added += 1;
  }

  writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  logger.info(`[curate:storage] +${added} decoded drives (now ${doc.components.length})`);
  logger.info('Next: npm run seed --workspace server');
}

main();
