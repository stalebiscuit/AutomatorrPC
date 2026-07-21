/**
 * DB-5: derive a performance-index raw score for benchmarked parts that Icecat
 * enriched with real specs but no benchmark (performanceIndex 0). Pure + testable.
 *
 * The raw scores are on the same scale as scoring.ts REFERENCES (so normaliseIndex
 * pins the reference part to 1000):
 *   GPU  → relative raster performance, RTX 4070 = 80 (reference)
 *   RAM  → memory score from type+speed, DDR5-5600 = 161 (reference)
 *   STORAGE → interface-tier score, Gen4 NVMe flagship ≈ 406 (reference)
 */
import type { BuilderCategory, Specs } from '@automatorr/shared';

/** Normalised GPU chipset key → relative performance (RTX 4070 = 80). */
const GPU_UBRAW: Record<string, number> = {
  // NVIDIA RTX 50
  rtx5090: 190, rtx5080: 124, rtx5070ti: 104, rtx5070: 96, rtx5060ti: 64, rtx5060: 50, rtx5050: 36,
  // NVIDIA RTX 40
  rtx4090: 140, rtx4080super: 118, rtx4080: 116, rtx4070tisuper: 100, rtx4070ti: 96,
  rtx4070super: 90, rtx4070: 80, rtx4060ti: 60, rtx4060: 50,
  // NVIDIA RTX 30
  rtx3090ti: 108, rtx3090: 104, rtx3080ti: 96, rtx3080: 92, rtx3070ti: 74, rtx3070: 68,
  rtx3060ti: 60, rtx3060: 44, rtx3050: 30,
  // NVIDIA GTX 16
  gtx1660super: 32, gtx1660ti: 33, gtx1660: 30, gtx1650: 22,
  // AMD RX 9000
  rx9070xt: 108, rx9070: 92, rx9060xt: 60,
  // AMD RX 7000
  rx7900xtx: 128, rx7900xt: 112, rx7900gre: 96, rx7800xt: 82, rx7700xt: 68, rx7600xt: 48, rx7600: 44,
  // AMD RX 6000
  rx6950xt: 100, rx6900xt: 96, rx6800xt: 84, rx6800: 76, rx6750xt: 64, rx6700xt: 60,
  rx6650xt: 46, rx6600xt: 44, rx6600: 40,
  // Intel Arc
  arcb580: 52, arcb570: 46, arca770: 48, arca750: 44, arca580: 38,
};

/** Parse a chipset string ("GeForce RTX 4070 SUPER") to a lookup key ("rtx4070super"). */
export function gpuKey(chipset: string): string | null {
  const s = chipset.toUpperCase().replace(/\s+/g, ' ');
  let m = s.match(/RTX\s*(\d{3,4})\s*(TI\s*SUPER|SUPER|TI)?/);
  if (m) return `rtx${m[1]}${normSuffix(m[2])}`;
  m = s.match(/GTX\s*(\d{3,4})\s*(SUPER|TI)?/);
  if (m) return `gtx${m[1]}${normSuffix(m[2])}`;
  m = s.match(/RX\s*(\d{3,4})\s*(XTX|XT|GRE)?/);
  if (m) return `rx${m[1]}${normSuffix(m[2])}`;
  m = s.match(/\bARC\b.*?([AB]\d{3})|\b([AB]\d{3})\b/);
  if (m) return `arc${(m[1] ?? m[2])!.toLowerCase()}`;
  return null;
}
function normSuffix(s?: string): string {
  if (!s) return '';
  const t = s.replace(/\s+/g, '').toLowerCase();
  return t === 'tisuper' ? 'tisuper' : t;
}

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);

/** GPU raw from the chipset spec (falls back to VRAM-scaled estimate if unknown). */
function gpuUbRaw(specs: Specs): number | null {
  const chip = String(specs.chipset ?? specs.gpuChipset ?? '');
  const key = chip ? gpuKey(chip) : null;
  if (key && GPU_UBRAW[key] !== undefined) return GPU_UBRAW[key];
  return null; // unknown chipset → leave for a median fallback
}

/** RAM raw from type + speed (reference: DDR5-5600 = 161). */
function ramUbRaw(specs: Specs): number | null {
  const type = String(specs.type ?? '').toUpperCase();
  const speed = num(specs.speedMTs);
  if (!speed) return null;
  if (type.includes('DDR5')) return Math.round((speed / 5600) * 161);
  if (type.includes('DDR4')) return Math.round((speed / 3200) * 95);
  if (type.includes('DDR3')) return Math.round((speed / 1600) * 45);
  return Math.round((speed / 5600) * 161); // assume DDR5-class if unlabeled
}

/** Storage raw from interface/subtype tier (reference: Gen4 NVMe flagship ≈ 406). */
function storageUbRaw(specs: Specs): number | null {
  const iface = String(specs.interface ?? '').toLowerCase();
  const subtype = String(specs.subtype ?? '').toLowerCase();
  const ff = String(specs.formFactor ?? '').toLowerCase();
  if (subtype === 'hdd' || /3\.5|sata.*hdd/.test(ff)) return 30;
  if (/pcie 5|gen5|5\.0/.test(iface)) return 500;
  if (/pcie 4|gen4|4\.0/.test(iface)) return 400;
  if (iface.includes('nvme') || ff.includes('m.2')) return 250; // Gen3-class NVMe
  if (iface.includes('sata') || ff.includes('2.5')) return 90; // SATA SSD
  return null;
}

/** Derive the reference-scale raw score for a benchmarked part, or null if unknown. */
export function benchmarkUbRaw(category: BuilderCategory, specs: Specs): number | null {
  if (category === 'gpu') return gpuUbRaw(specs);
  if (category === 'ram') return ramUbRaw(specs);
  if (category === 'storage') return storageUbRaw(specs);
  return null;
}
