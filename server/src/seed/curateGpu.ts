/**
 * Task 5 — scale GPU depth by decoding chipsets from the Mwave MPNs/names (no Icecat).
 * The chipset drives the DB-5 performance score; VRAM is canonical per chipset (MPN only for
 * dual-VRAM models); TBP from a chipset table; card length defaulted by tier (approximate).
 * Capped at 2 board-partner variants per (chipset, VRAM) for a diverse, non-duplicated set.
 *
 *   npm run curate:gpu --workspace server
 *   npm run seed       --workspace server
 *   npm run db4:images --workspace server -- --render --apply
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

// DB-5 GPU perf table (RTX 4070 = 80).
const GPU_UBRAW: Record<string, number> = {
  rtx5090: 190, rtx5080: 124, rtx5070ti: 104, rtx5070: 96, rtx5060ti: 64, rtx5060: 50, rtx5050: 36,
  rtx4090: 140, rtx4080super: 118, rtx4080: 116, rtx4070tisuper: 100, rtx4070ti: 96, rtx4070super: 90, rtx4070: 80, rtx4060ti: 60, rtx4060: 50,
  rtx3090ti: 108, rtx3090: 104, rtx3080ti: 96, rtx3080: 92, rtx3070ti: 74, rtx3070: 68, rtx3060ti: 60, rtx3060: 44, rtx3050: 30,
  gtx1660super: 32, gtx1660ti: 33, gtx1660: 30, gtx1650: 22,
  rx9070xt: 108, rx9070: 92, rx9060xt: 60, rx7900xtx: 128, rx7900xt: 112, rx7900gre: 96, rx7800xt: 82, rx7700xt: 68, rx7600xt: 48, rx7600: 44,
  rx6950xt: 100, rx6900xt: 96, rx6800xt: 84, rx6800: 76, rx6750xt: 64, rx6700xt: 60, rx6650xt: 46, rx6600xt: 44, rx6600: 40,
  arcb580: 52, arcb570: 46, arca770: 48, arca750: 44, arca580: 38,
};
const TBP: Record<string, number> = {
  rtx5090: 575, rtx5080: 360, rtx5070ti: 300, rtx5070: 250, rtx5060ti: 180, rtx5060: 145, rtx5050: 130,
  rtx4090: 450, rtx4080super: 320, rtx4080: 320, rtx4070tisuper: 285, rtx4070ti: 285, rtx4070super: 220, rtx4070: 200, rtx4060ti: 160, rtx4060: 115,
  rtx3090ti: 450, rtx3090: 350, rtx3080ti: 350, rtx3080: 320, rtx3070ti: 290, rtx3070: 220, rtx3060ti: 200, rtx3060: 170, rtx3050: 130,
  gtx1660super: 125, gtx1660ti: 120, gtx1660: 120, gtx1650: 75,
  rx9070xt: 304, rx9070: 220, rx9060xt: 160, rx7900xtx: 355, rx7900xt: 315, rx7900gre: 260, rx7800xt: 263, rx7700xt: 245, rx7600xt: 190, rx7600: 165,
  rx6950xt: 335, rx6900xt: 300, rx6800xt: 300, rx6800: 250, rx6750xt: 250, rx6700xt: 230, rx6650xt: 180, rx6600xt: 160, rx6600: 132,
  arcb580: 190, arcb570: 150, arca770: 225, arca750: 225, arca580: 185,
};
const CANON_VRAM: Record<string, number> = {
  rtx5090: 32, rtx5080: 16, rtx5070ti: 16, rtx5070: 12, rtx5060: 8, rtx5050: 8,
  rtx4090: 24, rtx4080super: 16, rtx4080: 16, rtx4070tisuper: 16, rtx4070ti: 12, rtx4070super: 12, rtx4070: 12, rtx4060: 8,
  rtx3090ti: 24, rtx3090: 24, rtx3080ti: 12, rtx3080: 10, rtx3070ti: 8, rtx3070: 8, rtx3060ti: 8, rtx3060: 12, rtx3050: 8,
  gtx1660super: 6, gtx1660ti: 6, gtx1660: 6, gtx1650: 4,
  rx9070xt: 16, rx9070: 16, rx7900xtx: 24, rx7900xt: 20, rx7900gre: 16, rx7800xt: 16, rx7700xt: 12, rx7600xt: 16, rx7600: 8,
  rx6950xt: 16, rx6900xt: 16, rx6800xt: 16, rx6800: 16, rx6750xt: 12, rx6700xt: 12, rx6650xt: 8, rx6600xt: 8, rx6600: 8,
  arcb580: 12, arcb570: 10, arca770: 16, arca750: 8, arca580: 8,
};
const DUAL_VRAM = new Set(['rtx5060ti', 'rtx4060ti', 'rx9060xt']);
const VALID_VRAM = new Set([4, 6, 8, 10, 12, 16, 20, 24, 32]);
const suffix = (s?: string): string => (s ? s.replace(/\s+/g, '').toLowerCase() : '');

function chipset(mpn: string, name: string): { key: string; disp: string } | null {
  const s = `${mpn} ${name}`.toUpperCase();
  let m = s.match(/(RTX|GTX)[\s-]?(\d{3,4})\s?(TI\s?SUPER|SUPER|TI)?/);
  if (m) return { key: `${m[1]!.toLowerCase()}${m[2]}${suffix(m[3])}`, disp: `${m[1]} ${m[2]}${m[3] ? ' ' + m[3]!.replace(/\s+/g, ' ') : ''}` };
  m = s.match(/\bRX[\s-]?(\d{3,4})\s?(XTX|XT|GRE)?/);
  if (m) return { key: `rx${m[1]}${suffix(m[2])}`, disp: `RX ${m[1]}${m[2] ? ' ' + m[2] : ''}` };
  m = s.match(/-N(\d{4})(TI)?/);
  if (m) return { key: `rtx${m[1]}${m[2] ? 'ti' : ''}`, disp: `RTX ${m[1]}${m[2] ? ' Ti' : ''}` };
  m = s.match(/-R(\d{4})(XT)?/);
  if (m) return { key: `rx${m[1]}${m[2] ? 'xt' : ''}`, disp: `RX ${m[1]}${m[2] ? ' XT' : ''}` };
  m = s.match(/\bARC[\s-]?([AB]\d{3})/);
  if (m) return { key: `arc${m[1]!.toLowerCase()}`, disp: `Arc ${m[1]}` };
  return null;
}
function vramFromMpn(s: string): number | null {
  let best: number | null = null;
  for (const mm of s.toUpperCase().matchAll(/(\d{1,2})G[BD]?\b/g)) { const v = Number(mm[1]); if (VALID_VRAM.has(v)) best = v; }
  return best;
}
const lengthFor = (name: string, key: string): number => (/\b(SFF|ITX|MINI)\b/i.test(name) ? 180 : /(90|80)/.test(key) ? 336 : /70/.test(key) ? 300 : 250);
const vramTypeFor = (key: string): string => (key.startsWith('rtx50') ? 'GDDR7' : /rtx40(80|90)|rtx4070ti/.test(key) ? 'GDDR6X' : 'GDDR6');

const PER_VARIANT = 2; // per (chipset, vram)

function main(): void {
  const csv = parseRows(readFileSync(path.join(SEED_DIR, 'mwave-catalog.csv'), 'utf8')).filter((r) => r.category === 'GPU' && r.confidence === 'high');
  const file = path.join(SEED_DIR, 'data', 'gpu.json');
  const doc = JSON.parse(readFileSync(file, 'utf8')) as { category: string; components: Array<{ slug: string }> };
  const have = new Set(doc.components.map((c) => c.slug));
  const seen: Record<string, number> = {};
  let added = 0;

  for (const r of csv) {
    const c = chipset(r.mpn, r.name);
    if (!c) continue;
    const ub = GPU_UBRAW[c.key];
    if (ub === undefined) continue;
    const mpnVram = vramFromMpn(r.mpn) ?? vramFromMpn(r.name);
    const vram = DUAL_VRAM.has(c.key) ? (mpnVram ?? CANON_VRAM[c.key]) : (CANON_VRAM[c.key] ?? mpnVram);
    if (!vram) continue;
    const variant = `${c.key}|${vram}`;
    if ((seen[variant] ?? 0) >= PER_VARIANT) continue;
    const brand = r.name.split(' ')[0]!;
    const name = `${brand} ${c.disp} ${vram}GB`;
    const slug = slugify(name);
    seen[variant] = (seen[variant] ?? 0) + 1;
    if (have.has(slug)) continue;
    doc.components.push({
      brand,
      name,
      slug,
      imageUrl: null,
      csv: { type: 'GPU', model: c.disp },
      fallbackUbRaw: ub,
      specs: { chipset: c.disp, vram, vramType: vramTypeFor(c.key), tbp: TBP[c.key] ?? 200, length: lengthFor(r.name, c.key), color: 'Black' },
      specSourceUrl: `https://www.mwave.com.au/search?q=${encodeURIComponent(name)}`,
      unknownFields: [],
      prices: [],
    } as never);
    added += 1;
  }

  writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  logger.info(`[curate:gpu] +${added} decoded GPUs (now ${doc.components.length}) across ${Object.keys(seen).length} chipset/VRAM variants`);
  logger.info('Next: npm run seed --workspace server');
}

main();
