/**
 * Decode a crawled retailer listing NAME into builder-ready specs + a performance score.
 * Listing names from category pages are descriptive (e.g. "Corsair Vengeance DDR5-6000 CL30
 * 32GB", "ASUS DUAL RTX 4070 12GB", "Samsung 990 Pro 2TB", "Corsair RM850e 850W 80+ Gold"),
 * so this is name-based (unlike the MPN decoders). Pure + fixture-testable.
 */
import type { BuilderCategory, Specs } from '@automatorr/shared';
import { validateSpecs } from '@automatorr/shared';

export interface DecodedPart {
  brand: string;
  specs: Specs;
  /** benchmarked categories only (cpu/gpu/ram/storage) — reference-scale raw score */
  ubRaw: number | null;
  builderReady: boolean;
  missing: string[];
}

const brandOf = (name: string): string => {
  const map: Record<string, string> = { 'g.skill': 'G.SKILL', gskill: 'G.SKILL', 'western digital': 'WD', wd: 'WD', 'be quiet!': 'be quiet!', 'cooler master': 'Cooler Master', 'lian li': 'Lian Li', 'silicon power': 'Silicon Power' };
  const two = name.toLowerCase().split(/\s+/).slice(0, 2).join(' ');
  if (map[two]) return map[two];
  const one = name.split(/\s+/)[0] ?? '';
  return map[one.toLowerCase()] ?? one;
};
const num = (s: string, re: RegExp): number | undefined => { const m = s.match(re); return m ? Number(m[1]) : undefined; };

// ---- GPU tables (DB-5) ----
const GPU_UBRAW: Record<string, number> = { rtx5090:190,rtx5080:124,rtx5070ti:104,rtx5070:96,rtx5060ti:64,rtx5060:50,rtx5050:36,rtx4090:140,rtx4080super:118,rtx4080:116,rtx4070tisuper:100,rtx4070ti:96,rtx4070super:90,rtx4070:80,rtx4060ti:60,rtx4060:50,rtx3090ti:108,rtx3090:104,rtx3080ti:96,rtx3080:92,rtx3070ti:74,rtx3070:68,rtx3060ti:60,rtx3060:44,rtx3050:30,gtx1660super:32,gtx1660ti:33,gtx1660:30,gtx1650:22,rx9070xt:108,rx9070:92,rx9060xt:60,rx7900xtx:128,rx7900xt:112,rx7900gre:96,rx7800xt:82,rx7700xt:68,rx7600xt:48,rx7600:44,rx6950xt:100,rx6900xt:96,rx6800xt:84,rx6800:76,rx6750xt:64,rx6700xt:60,rx6650xt:46,rx6600xt:44,rx6600:40,arcb580:52,arcb570:46,arca770:48,arca750:44,arca580:38 };
const GPU_TBP: Record<string, number> = { rtx5090:575,rtx5080:360,rtx5070ti:300,rtx5070:250,rtx5060ti:180,rtx5060:145,rtx5050:130,rtx4090:450,rtx4080super:320,rtx4080:320,rtx4070tisuper:285,rtx4070ti:285,rtx4070super:220,rtx4070:200,rtx4060ti:160,rtx4060:115,rtx3090ti:450,rtx3090:350,rtx3080ti:350,rtx3080:320,rtx3070ti:290,rtx3070:220,rtx3060ti:200,rtx3060:170,rtx3050:130,gtx1660super:125,gtx1660ti:120,gtx1660:120,gtx1650:75,rx9070xt:304,rx9070:220,rx9060xt:160,rx7900xtx:355,rx7900xt:315,rx7900gre:260,rx7800xt:263,rx7700xt:245,rx7600xt:190,rx7600:165,rx6950xt:335,rx6900xt:300,rx6800xt:300,rx6800:250,rx6750xt:250,rx6700xt:230,rx6650xt:180,rx6600xt:160,rx6600:132,arcb580:190,arcb570:150,arca770:225,arca750:225,arca580:185 };
const GPU_VRAM: Record<string, number> = { rtx5090:32,rtx5080:16,rtx5070ti:16,rtx5070:12,rtx5060:8,rtx5050:8,rtx4090:24,rtx4080super:16,rtx4080:16,rtx4070tisuper:16,rtx4070ti:12,rtx4070super:12,rtx4070:12,rtx4060:8,rtx3090ti:24,rtx3090:24,rtx3080ti:12,rtx3080:10,rtx3070ti:8,rtx3070:8,rtx3060ti:8,rtx3060:12,rtx3050:8,gtx1660super:6,gtx1660ti:6,gtx1660:6,gtx1650:4,rx9070xt:16,rx9070:16,rx7900xtx:24,rx7900xt:20,rx7900gre:16,rx7800xt:16,rx7700xt:12,rx7600xt:16,rx7600:8,rx6950xt:16,rx6900xt:16,rx6800xt:16,rx6800:16,rx6750xt:12,rx6700xt:12,rx6650xt:8,rx6600xt:8,rx6600:8,arcb580:12,arcb570:10,arca770:16,arca750:8,arca580:8 };
const DUAL_VRAM = new Set(['rtx5060ti', 'rtx4060ti', 'rx9060xt']);
function gpuChipset(name: string): { key: string; disp: string } | null {
  const s = name.toUpperCase();
  let m = s.match(/(RTX|GTX)\s?-?\s?(\d{3,4})\s?(TI\s?SUPER|SUPER|TI)?/);
  if (m) { const suf = m[3] ? m[3].replace(/\s+/g, '').toLowerCase() : ''; return { key: `${m[1]!.toLowerCase()}${m[2]}${suf}`, disp: `${m[1]} ${m[2]}${m[3] ? ' ' + m[3]!.replace(/\s+/g, ' ') : ''}` }; }
  m = s.match(/\bRX\s?-?\s?(\d{3,4})\s?(XTX|XT|GRE)?/);
  if (m) return { key: `rx${m[1]}${m[2] ? m[2].toLowerCase() : ''}`, disp: `RX ${m[1]}${m[2] ? ' ' + m[2] : ''}` };
  m = s.match(/\bARC\s?-?\s?([AB]\d{3})/);
  if (m) return { key: `arc${m[1]!.toLowerCase()}`, disp: `Arc ${m[1]}` };
  return null;
}

/** Pro / workstation / entry GPUs absent from the gaming perf table — included with a coarse,
 *  transparent estimated score (max-coverage policy). Only reached when gpuChipset finds no gaming match. */
function decodeProGpu(name: string): { disp: string; ub: number } | null {
  const s = name.toLowerCase();
  let m = s.match(/rtx\s*pro\s*(\d{4})/);
  if (m) { const ub = ({ '6000': 185, '5000': 120, '4500': 100, '4000': 88, '2000': 62 } as Record<string, number>)[m[1]!]; if (ub) return { disp: `RTX PRO ${m[1]}`, ub }; }
  m = s.match(/rtx\s*a(\d{3,4})/);
  if (m) { const ub = ({ '400': 16, '1000': 30, '2000': 44, '4000': 70, '4500': 82, '5000': 95, '6000': 110 } as Record<string, number>)[m[1]!]; if (ub) return { disp: `RTX A${m[1]}`, ub }; }
  m = s.match(/arc\s*pro\s*b(\d{2})/);
  if (m) return { disp: `Arc Pro B${m[1]}`, ub: m[1] === '70' ? 58 : m[1] === '60' ? 52 : 40 };
  if (/\barc\s*b50\b/.test(s)) return { disp: 'Arc B50', ub: 40 };
  m = s.match(/\barc\s*a(3\d{2})/);
  if (m) return { disp: `Arc A${m[1]}`, ub: m[1] === '380' ? 22 : 18 };
  m = s.match(/\bgt\s*(\d{3,4})/);
  if (m) return { disp: `GT ${m[1]}`, ub: m[1] === '1030' ? 12 : m[1] === '730' ? 6 : 5 };
  return null;
}

// chipset -> socket for motherboards
const WS_MOBO_SOCKET: Record<string, string> = { TRX50: 'sTR5', WRX90: 'sTR5', TRX40: 'sTRX4', WRX80: 'sWRX8' };
const MOBO_SOCKET: Record<string, string> = { x870:'AM5',b850:'AM5',b650:'AM5',x670:'AM5',a620:'AM5',x570:'AM4',b550:'AM4',b450:'AM4',a520:'AM4',z890:'LGA 1851',b860:'LGA 1851',z790:'LGA 1700',b760:'LGA 1700',h770:'LGA 1700',z690:'LGA 1700',b660:'LGA 1700',z590:'LGA 1200',b560:'LGA 1200',z490:'LGA 1200',b460:'LGA 1200',b840:'AM5',h610:'LGA 1700',h670:'LGA 1700',h810:'LGA 1851' };

// ---- CPU (crawl): socket from the model family, score from the UserBenchmark CSV ----
export interface CpuBenchRow { model: string; score: number }
export type CpuBench = Map<string, CpuBenchRow>;
/** Normalised key for matching a CPU model to the benchmark CSV (shared with the loader). */
export const cpuKey = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');
/** Pull the CPU model substring from a messy listing name — suffix letters only, never a stray digit. */
function cpuModel(name: string): string | null {
  let m = name.match(/ryzen\s+threadripper(?:\s+pro)?\s+\d{4}\s*(?:wx|x)?\b/i);
  if (m) return m[0].replace(/\s+/g, ' ').trim();
  m = name.match(/\bepyc\s+\d{4}[a-z]?\b/i);
  if (m) return m[0].replace(/\s+/g, ' ').trim();
  m = name.match(/ryzen\s+\d\s+\d{3,4}\s*(?:x3d|ge|gt|g|xt|x|f)?\b/i);
  if (m) return m[0].replace(/\s+/g, ' ').trim();
  m = name.match(/core\s+ultra\s+\d\s+\d{3}\s*(?:kf|ks|k|f|t)?(?:\s*plus)?\b/i);
  if (m) return m[0].replace(/\s+/g, ' ').trim();
  m = name.match(/core\s+i\d[-\s]?\d{4,5}\s*(?:kf|ks|k|f|t)?\b/i);
  if (m) return m[0].replace(/\s+/g, ' ').trim();
  return null;
}
/** Socket from the CPU model family (deterministic for mainstream desktop; null -> skip). */
function cpuSocket(model: string): string | null {
  const s = model.toLowerCase();
  if (/xeon/.test(s)) return null; // many disparate sockets — leave Xeon to curation
  let m = s.match(/threadripper[a-z ]*?(\d)\d{3}/);
  if (m) { const g = m[1]!; if (g === '9' || g === '7') return 'sTR5'; if (g === '5') return 'sWRX8'; if (g === '3') return 'sTRX4'; return 'sTR4'; }
  m = s.match(/epyc\s+(\d)\d{3}/);
  if (m) return m[1] === '9' ? 'SP5' : 'SP3';
  m = s.match(/ryzen\s*\d\s*(\d)\d{2}/);
  if (m) { const fam = m[1]!; if (fam === '9' || fam === '8' || fam === '7') return 'AM5'; if (fam === '5' || fam === '4' || fam === '3') return 'AM4'; }
  if (/core\s*ultra\s*\d\s*2\d{2}/.test(s)) return 'LGA 1851';
  m = s.match(/core\s*i\d[-\s]*(\d{4,5})/);
  if (m) { const n = Number(m[1]); if (n >= 12000 && n < 15000) return 'LGA 1700'; if (n >= 10000 && n < 12000) return 'LGA 1200'; }
  return null;
}

/** Fallback reference-scale score for a CPU not in the UserBenchmark CSV (transparent estimate,
 *  used only so workstation / brand-new SKUs are still included per the max-coverage policy). */
function cpuFallbackUb(model: string): number {
  const s = model.toLowerCase();
  if (/threadripper/.test(s)) return 88;
  if (/epyc/.test(s)) return 85;
  const x3d = /x3d/.test(s) ? 6 : 0;
  let m = s.match(/ryzen\s*(\d)\b/);
  if (m) { const t = m[1]; return (t === '9' ? 118 : t === '7' ? 110 : t === '5' ? 104 : 90) + x3d; }
  if (/core\s*ultra\s*9/.test(s)) return 121;
  if (/core\s*ultra\s*7/.test(s)) return 118;
  if (/core\s*ultra\s*5/.test(s)) return 108;
  m = s.match(/core\s*i(\d)/);
  if (m) { const t = m[1]; return t === '9' ? 124 : t === '7' ? 119 : t === '5' ? 104 : 94; }
  return 80;
}

function ramUb(type: string, speed: number): number {
  if (type === 'DDR5') return Math.round((speed / 5600) * 161);
  if (type === 'DDR4') return Math.round((speed / 3200) * 95);
  return Math.round((speed / 1600) * 45);
}

/** Decode one listing name for a category. Returns null if the name isn't decodable for it. */
export function decodeCrawledPart(category: BuilderCategory, name: string, cpuBench?: CpuBench): DecodedPart | null {
  const brand = brandOf(name);
  let specs: Specs = {};
  let ubRaw: number | null = null;

  if (category === 'ram') {
    const type = (name.match(/DDR([345])/i) ? `DDR${name.match(/DDR([345])/i)![1]}` : '').toUpperCase();
    const speed = num(name, /(?:DDR[345][\s-]?)(\d{4,5})/i) ?? num(name, /\b(\d{4,5})\s?(?:MHz|MT)/i) ?? num(name, /-(\d{4,5})\b/);
    const cas = num(name, /\bCL\s?(\d{2})\b/i) ?? num(name, /\bC(\d{2})\b/);
    const cap = num(name, /(\d{1,3})\s?GB/i);
    if (!type || !speed || !cap) return null;
    specs = { type, speedMTs: speed, capacity: cap, casLatency: cas ?? 0, kitConfig: `${cap} GB`, color: 'Black' };
    if (!cas) delete (specs as Record<string, unknown>).casLatency;
    ubRaw = ramUb(type, speed);
  } else if (category === 'gpu') {
    const c = gpuChipset(name);
    if (c && GPU_UBRAW[c.key] !== undefined) {
      const vramName = num(name, /(\d{1,2})\s?GB?\b/i);
      const vram = DUAL_VRAM.has(c.key) ? (vramName ?? GPU_VRAM[c.key]) : (GPU_VRAM[c.key] ?? vramName);
      if (!vram) return null;
      const length = /\b(SFF|ITX|MINI)\b/i.test(name) ? 180 : /(90|80)/.test(c.key) ? 336 : /70/.test(c.key) ? 300 : 250;
      specs = { chipset: c.disp, vram, tbp: GPU_TBP[c.key] ?? 200, length, color: 'Black' };
      ubRaw = GPU_UBRAW[c.key]!;
    } else {
      const pro = decodeProGpu(name);
      if (!pro) return null;
      const vram = num(name, /(\d{1,3})\s?GB?\b/i) ?? 8;
      const length = /\b(sff|itx|mini|low[- ]?profile|single[- ]?slot|passive)\b/i.test(name) ? 180 : 267;
      specs = { chipset: pro.disp, vram, tbp: 200, length, color: 'Black' };
      ubRaw = pro.ub;
    }
  } else if (category === 'storage') {
    const tb = num(name, /(\d+)\s?TB/i);
    const gb = num(name, /(\d{3,4})\s?GB/i);
    const cap = tb ? tb * 1000 : gb ?? null;
    if (!cap) return null;
    const s = name.toUpperCase();
    const hdd = /\b(HDD|BARRACUDA|IRONWOLF|SKYHAWK|3\.5")\b/.test(s);
    const iface = hdd ? 'SATA III' : /PCIE ?5|GEN ?5/.test(s) ? 'NVMe PCIe 5.0' : /\bSATA\b|2\.5"/.test(s) ? 'SATA III' : 'NVMe PCIe 4.0';
    const subtype = hdd ? 'hdd' : 'ssd';
    const formFactor = subtype === 'hdd' ? '3.5"' : iface.startsWith('SATA') ? '2.5"' : 'M.2 2280';
    specs = { subtype, capacity: cap, formFactor, interface: iface };
    ubRaw = subtype === 'hdd' ? 30 : /PCIE 5/.test(iface) ? 500 : /PCIE 4/.test(iface) ? 400 : /NVME/i.test(iface) ? 250 : 90;
  } else if (category === 'psu') {
    const w = num(name, /(\d{3,4})\s?W\b/i);
    if (!w) return null;
    const eff = name.match(/\b(?:80\+?\s?)?(titanium|platinum|gold|bronze|silver|white)\b/i);
    specs = { wattage: w };
    if (eff) specs.efficiency = `80+ ${eff[1]![0]!.toUpperCase()}${eff[1]!.slice(1).toLowerCase()}`;
    specs.modular = /fully modular|full modular|\bmodular\b/i.test(name) ? 'Full' : /semi/i.test(name) ? 'Semi' : 'Non';
    specs.formFactor = /\bsfx-?l?\b/i.test(name) ? 'SFX' : 'ATX';
  } else if (category === 'cooler') {
    const isAio = /aio|liquid|kraken|coreliquid|masterliquid|galahad|\b(240|280|360|420)\s?mm\b/i.test(name);
    specs = { type: isAio ? 'aio' : 'air', socketSupport: 'AM5,AM4,AM3+,LGA1700,LGA1851,LGA1200,LGA1150,LGA1151,LGA1155,LGA2011-v3,LGA2066' };
    if (isAio) specs.radiatorSize = num(name, /\b(120|240|280|360|420)\b/) ?? 360;
    else specs.height = num(name, /(\d{2,3})\s?mm/) ?? 158;
    const col = name.match(/\b(white|black|silver)\b/i); if (col) specs.color = col[1]![0]!.toUpperCase() + col[1]!.slice(1).toLowerCase();
  } else if (category === 'case') {
    const itx = /\bitx\b|mini-itx|sff/i.test(name); const matx = /\bmatx\b|micro-?atx/i.test(name);
    specs = itx ? { formFactorSupport: 'Mini-ITX', maxGpuLength: 330, maxCoolerHeight: 67 } : matx ? { formFactorSupport: 'Micro-ATX,Mini-ITX', maxGpuLength: 330, maxCoolerHeight: 160 } : { formFactorSupport: 'ATX,Micro-ATX,Mini-ITX', maxGpuLength: 360, maxCoolerHeight: 165 };
    const col = name.match(/\b(white|black|silver)\b/i); if (col) specs.color = col[1]![0]!.toUpperCase() + col[1]!.slice(1).toLowerCase();
  } else if (category === 'motherboard') {
    const wsChip = name.match(/\b(TRX50|TRX40|WRX90|WRX80)[A-Z]*\b/i)?.[1]?.toUpperCase();
    const chip = name.match(/\b([XZBHA]\d{3})[A-Z]*\b/i)?.[1]?.toLowerCase(); // base chipset only (strip M/E/I form-factor suffix)
    const socket = wsChip ? WS_MOBO_SOCKET[wsChip] : chip ? MOBO_SOCKET[chip] : undefined;
    if (!socket) return null;
    const ramType = /ddr5/i.test(name) ? 'DDR5' : /ddr4/i.test(name) ? 'DDR4' : (socket === 'AM5' || /1851/.test(socket) || socket === 'sTR5') ? 'DDR5' : 'DDR4';
    const formFactor = /mini-?itx|\bitx\b/i.test(name) ? 'Mini-ITX' : /micro-?atx|matx|\bm-?atx\b/i.test(name) ? 'Micro-ATX' : 'ATX';
    specs = { socket, chipset: wsChip ?? chip!.toUpperCase(), ramType, formFactor, ramSlots: formFactor === 'Mini-ITX' ? 2 : 4 };
  } else if (category === 'monitor') {
    const s = name.toLowerCase();
    const size = num(name, /(\d{2}(?:\.\d)?)\s?(?:inch|in|")\b/i) ?? num(name, /\b(\d{2})\b(?=.*(?:hz|qhd|uhd|fhd|4k|5k|6k))/i);
    const refresh = num(name, /(\d{2,3})\s?hz/i) ?? 60; // office/designer panels omit Hz → default 60
    const resolution = /dqhd/.test(s) ? '5120x1440' : /wuhd/.test(s) ? '5120x2160' : /\b6k\b/.test(s) ? '6144x3456' : /\b5k\b|2880/.test(s) ? '5120x2880' : /4k|uhd|3840|2160/.test(s) ? '3840x2160' : /qhd|1440|2560/.test(s) ? '2560x1440' : /fhd|1080|1920/.test(s) ? '1920x1080' : '';
    if (!resolution) return null;
    specs = { resolution, refreshHz: refresh };
    if (size) specs.size = size;
  } else if (category === 'cpu') {
    const cand = cpuModel(name);
    if (!cand) return null;                     // can't identify a CPU model -> skip
    const socket = cpuSocket(cand);
    if (!socket) return null;                   // unknown socket family (e.g. Xeon) -> leave to curation
    const row = cpuBench?.get(cpuKey(cand));
    ubRaw = row ? row.score : cpuFallbackUb(cand); // real UserBenchmark score, else a transparent estimate
    specs = { socket };
    const cores = num(name, /(\d{1,2})[\s-]?core/i);
    if (cores) specs.cores = cores;
  } else {
    return null;
  }

  const v = validateSpecs(category, specs);
  return { brand, specs, ubRaw, builderReady: v.builderReady, missing: v.missingCritical };
}
