/**
 * Maps an Icecat datasheet → our canonical Component shape (Task 3). Icecat
 * feature names vary, so FEATURE_MAP lists candidate names per spec key and we
 * coerce values using the shared CATEGORY_SPEC_SCHEMA (numbers parsed, lists
 * kept comma-separated). Enthusiast fields Icecat lacks (e.g. GPU length) simply
 * stay absent and are gated/curated downstream.
 */
import type { BuilderCategory, Specs } from '@automatorr/shared';
import { CATEGORY_SPEC_SCHEMA, validateSpecs } from '@automatorr/shared';
import { canonicalSlug } from '../canonical.js';
import type { NormalizedPart } from '../ingest.js';
import type { IcecatData } from './client.js';

/** Candidate Icecat feature names (lowercased) per our spec key. */
const FEATURE_MAP: Partial<Record<BuilderCategory, Record<string, string[]>>> = {
  // CPUs are Full-Icecat-gated → curated in cpu.json; kept minimal for completeness.
  cpu: {
    socket: ['processor socket'],
    tdp: ['thermal design power (tdp)', 'thermal design power'],
    cores: ['number of processor cores', 'processor cores'],
    boostClock: ['processor boost clock speed', 'processor turbo speed'],
    igpu: ['on-board graphics adapter', 'processor graphics model'],
  },
  motherboard: {
    socket: ['processor socket'],
    chipset: ['motherboard chipset'],
    ramType: ['supported memory types'],
    ramSlots: ['number of memory slots'],
    maxRamSpeed: ['supported memory clock speeds'],
    formFactor: ['motherboard form factor'],
    m2Slots: ['number of m.2 (m) slots', 'number of m.2'],
  },
  ram: {
    color: ['product colour', 'colour', 'color'],
    type: ['internal memory type'],
    speedMTs: ['memory data transfer rate'],
    capacity: ['internal memory'],
    kitConfig: ['memory layout (modules x size)', 'module configuration'],
    casLatency: ['cas latency'],
    voltage: ['memory voltage'], // display bonus
  },
  storage: {
    capacity: ['ssd capacity', 'storage capacity', 'hdd capacity', 'internal hard drive capacity'],
    formFactor: ['ssd form factor', 'storage drive size', 'hard drive size', 'form factor'],
    interface: ['interface', 'internal data transfer rate'],
    rpm: ['rotational speed', 'spindle speed'], // → HDD subtype signal
    seqRead: ['read speed'], // display bonus
    seqWrite: ['write speed'], // display bonus
  },
  gpu: {
    // Verified against a real Icecat GPU datasheet (MSI RTX 4080).
    chipset: ['graphics processor'],
    color: ['product colour', 'colour', 'color'],
    vram: ['discrete graphics card memory', 'graphics card memory'],
    vramType: ['graphics card memory type'],
    length: ['length'],
    interface: ['interface type'],
    slotWidth: ['number of slots'],
    minSystemPsu: ['minimum system power supply'],
    powerConnectors: ['supplementary power connectors'],
    hdmiPorts: ['hdmi ports quantity'], // display bonus
    dpPorts: ['displayports quantity'], // display bonus
  },
  case: {
    caseType: ['type'],
    formFactorSupport: ['supported motherboard form factors'],
    maxGpuLength: ['maximum graphics card length'],
    maxCoolerHeight: ['maximum cpu cooler height'],
    color: ['product colour', 'colour', 'color'],
    maxPsuLength: ['maximum psu length'], // display bonus
  },
  psu: {
    wattage: ['total power'],
    efficiency: ['efficiency'],
    modular: ['cabling type'],
    formFactor: ['power supply unit (psu) form factor'],
    pcieConnectors: ['pci express power connectors (6+2 pin)', 'pci express power connectors'], // display bonus
  },
  cooler: {
    type: ['type'],
    socketSupport: ['supported processor sockets'],
    height: ['height'],
    color: ['product colour', 'colour', 'color'],
    radiatorWidth: ['radiator width'], // display bonus
    noiseMax: ['fan noise level (max)'], // display bonus
  },
  monitor: {
    resolution: ['display resolution'],
    size: ['display diagonal'],
    panelType: ['panel type'],
    refreshHz: ['maximum refresh rate'],
    responseTime: ['response time'], // display bonus
  },
};

/** Flatten FeaturesGroups → { lowercased feature name: value }. First wins. */
export function flattenFeatures(data: IcecatData): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const group of data.FeaturesGroups ?? []) {
    for (const f of group.Features ?? []) {
      const name = f.Feature?.Name?.Value?.toLowerCase().trim();
      if (!name || name in flat) continue;
      const value = f.RawValue ?? f.Value ?? f.PresentationValue ?? '';
      if (value !== '') flat[name] = value;
    }
  }
  return flat;
}

function firstNumber(s: string): number | undefined {
  const m = s.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : undefined;
}

/** Build our specs map from Icecat features, coercing by the schema's field kind. */
export function icecatToSpecs(category: BuilderCategory, flat: Record<string, string>): Specs {
  const specs: Specs = {};
  const map = FEATURE_MAP[category] ?? {};
  const numberKeys = new Set(
    (CATEGORY_SPEC_SCHEMA[category] ?? []).filter((d) => d.kind === 'number').map((d) => d.key),
  );
  const flatKeys = Object.keys(flat);
  for (const [ourKey, candidates] of Object.entries(map)) {
    let raw: string | undefined;
    for (const cand of candidates) {
      const hit = flatKeys.find((k) => k === cand) ?? flatKeys.find((k) => k.includes(cand));
      if (hit) {
        raw = flat[hit];
        break;
      }
    }
    if (raw === undefined || raw.trim() === '') continue;
    if (numberKeys.has(ourKey)) {
      const n = firstNumber(raw);
      if (n !== undefined) specs[ourKey] = n;
    } else {
      specs[ourKey] = raw.trim();
    }
  }
  // Value normalization for fields the compatibility engine compares directly.
  if (typeof specs.socket === 'string') {
    specs.socket = specs.socket.replace(/^(cpu\s+)?socket\s+/i, '').trim();
  }
  if (category === 'cooler' && typeof specs.type === 'string') {
    const t = specs.type.toLowerCase();
    if (/liquid|water|aio/.test(t)) specs.type = 'aio';
    else if (/air/.test(t)) specs.type = 'air';
  }
  return specs;
}

/** Convert an Icecat datasheet into a NormalizedPart for a given builder category. */
/**
 * Trim a raw Icecat product string down to a clean, short display name. Icecat's
 * `Title` is often a marketing blob (e.g. "MSI MAG CORELIQUID 360R CPU AIO Cooler
 * ' 360mm Radiator, 3x 120mm ARGB PWM Fan, Adjustable ARGB Dragon CPU Mount, …").
 * We cut at the first description delimiter and cap the length at a word boundary
 * so the picker/build table never renders the full marketing sentence.
 */
export function cleanName(raw: string): string {
  let n = raw.trim();
  // Cut at the first description delimiter: apostrophe/quote used as a separator,
  // comma, or a spaced dash/colon/semicolon/pipe.
  const cut = n.search(/(\s['"`\u2019]\s)|,|(\s[-\u2013\u2014:;|]\s)/);
  if (cut > 0) n = n.slice(0, cut);
  n = n.replace(/\s{2,}/g, ' ').trim();
  // Cap overly long names at a word boundary.
  const MAX = 72;
  if (n.length > MAX) n = n.slice(0, MAX).replace(/\s+\S*$/, '').trim();
  return n;
}

/**
 * Capacity-variant products (storage/RAM) often share an Icecat ProductName
 * across sizes (e.g. Samsung "990 PRO" for both 1 TB and 2 TB) → identical slug
 * → they collide on upsert. Fold the capacity into the name so each size is a
 * distinct canonical record.
 */
function withCapacity(category: BuilderCategory, name: string, specs: Specs): string {
  if (category !== 'storage' && category !== 'ram') return name;
  const raw = specs.capacity;
  const cap = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(cap) || cap <= 0) return name;
  const label =
    category === 'storage' && cap >= 1000
      ? `${cap % 1000 === 0 ? cap / 1000 : (cap / 1000).toFixed(1)} TB`
      : `${cap} GB`;
  const num = label.split(' ')[0]!;
  // Skip if the capacity is already stated in the name (e.g. "…32GB…").
  if (new RegExp(`\\b${num}\\s?(gb|tb)\\b`, 'i').test(name)) return name;
  return `${name} ${label}`;
}

/**
 * Infer the storage subtype Icecat doesn't state directly: a rotational/spindle
 * speed means a mechanical HDD; NVMe/M.2 or an SSD-capacity field means an SSD.
 * Defaults to SSD for a 2.5"/M.2 drive, HDD for 3.5".
 */
function inferStorageSubtype(flat: Record<string, string>, specs: Specs): 'ssd' | 'hdd' {
  const keys = Object.keys(flat).join(' | ');
  if (/rotational|spindle|\brpm\b/i.test(keys)) return 'hdd';
  const iface = String(specs.interface ?? '').toLowerCase();
  const ff = String(specs.formFactor ?? '').toLowerCase();
  if (iface.includes('nvme') || ff.includes('m.2') || 'ssd capacity' in flat) return 'ssd';
  if (ff.includes('3.5')) return 'hdd';
  return 'ssd';
}

export function normalizeIcecatProduct(
  data: IcecatData,
  category: BuilderCategory,
): NormalizedPart | null {
  const gi = data.GeneralInfo;
  const ei = data.EssentialInfo;
  const brand = (gi?.Brand ?? ei?.Brand)?.trim();
  const productName = (gi?.ProductName ?? ei?.ProductName)?.trim();
  // Prefer a concise "Brand ProductName". Only fall back to Icecat's long Title
  // when ProductName is absent, and always run it through cleanName() so the
  // marketing description never becomes the stored name.
  const rawName =
    brand && productName && !productName.toLowerCase().startsWith(brand.toLowerCase())
      ? `${brand} ${productName}`
      : (productName ?? gi?.Title)?.trim();
  if (!brand || !rawName) return null;
  const baseName = cleanName(rawName);
  if (!baseName) return null;

  const flat = flattenFeatures(data);
  const specs = icecatToSpecs(category, flat);
  if (category === 'storage' && !specs.subtype) {
    specs.subtype = inferStorageSubtype(flat, specs);
  }
  const name = withCapacity(category, baseName, specs);
  const mainGallery = data.Gallery?.find((g) => g.IsMain === 'Y') ?? data.Gallery?.[0];
  const imageUrl =
    data.Image?.Pic500x500 ?? data.Image?.HighPic ?? mainGallery?.Pic500x500 ?? mainGallery?.HighPic ?? null;
  const specSourceUrl = gi?.IcecatId
    ? `https://icecat.biz/en/p/${gi.IcecatId}`
    : 'https://icecat.biz';
  const unknownFields = validateSpecs(category, specs).missingCritical;
  const gtin = gi?.GTIN?.[0] ?? ei?.GTIN?.[0] ?? null;

  return { category, brand, name, slug: canonicalSlug(name), imageUrl, gtin, specs, specSourceUrl, unknownFields, prices: [] };
}
