import type { CompareCategory, Direction, StorageSubtype } from '@automatorr/shared';

/**
 * Per-category compare configuration (spec §11). The Compare service reads this
 * to set Lead flags, count the win tally, pick decisive deltas, and derive
 * "best for" tags — so adding a comparable field is a config edit, nothing more.
 *
 * Derived (non-spec) field keys understood by the Compare service:
 *   - `performanceIndex` — the normalised index (always compared, higher wins)
 *   - `price`            — best (lowest) price across `prices[]`
 *   - `pricePerTB`       — derived best price ÷ capacity-in-TB (storage)
 */

export type FieldGroup = 'common' | 'ssd' | 'hdd';
export type DeltaFormat = 'percent' | 'currency' | 'absolute';

export interface CompareField {
  key: string;
  label: string;
  /** only meaningful for numeric comparable fields */
  direction?: Direction;
  unit?: string;
  /** numeric → eligible for Lead/tally/delta; false → info-only row */
  numeric: boolean;
  /** contributes to the win tally (when in scope for the comparison) */
  counted: boolean;
  /** storage subtype grouping; absent = applies to all parts in the category */
  group?: FieldGroup;
  /** how a decisive delta is formatted if this field is surfaced */
  deltaFormat?: DeltaFormat;
}

export type TagMode = 'anyLead' | 'allLead';

export interface TagRule {
  tag: string;
  fields: string[];
  mode: TagMode;
  /** only evaluated when the winner is this storage subtype */
  requiresSubtype?: StorageSubtype;
}

export interface CategoryCompareConfig {
  category: CompareCategory;
  fields: CompareField[];
  /** ordered candidates for the (up to 3) decisive delta tiles */
  deltaFields: string[];
  tags: TagRule[];
}

const PERF: CompareField = {
  key: 'performanceIndex',
  label: 'Performance index',
  direction: 'higher',
  unit: '',
  numeric: true,
  counted: true,
  deltaFormat: 'percent',
};

const PRICE: CompareField = {
  key: 'price',
  label: 'Best price',
  direction: 'lower',
  unit: 'AUD',
  numeric: true,
  counted: true,
  deltaFormat: 'currency',
};

export const COMPARE_CONFIGS: Record<CompareCategory, CategoryCompareConfig> = {
  cpu: {
    category: 'cpu',
    fields: [
      PERF,
      { key: 'cores', label: 'Cores', direction: 'higher', numeric: true, counted: true, deltaFormat: 'absolute' },
      { key: 'threads', label: 'Threads', direction: 'higher', numeric: true, counted: true, deltaFormat: 'absolute' },
      { key: 'baseClock', label: 'Base clock', unit: 'GHz', direction: 'higher', numeric: true, counted: true, deltaFormat: 'absolute' },
      { key: 'boostClock', label: 'Boost clock', unit: 'GHz', direction: 'higher', numeric: true, counted: true, deltaFormat: 'absolute' },
      { key: 'l3Cache', label: 'L3 cache', unit: 'MB', direction: 'higher', numeric: true, counted: true, deltaFormat: 'absolute' },
      { key: 'tdp', label: 'TDP', unit: 'W', direction: 'lower', numeric: true, counted: true, deltaFormat: 'percent' },
      { key: 'socket', label: 'Socket', numeric: false, counted: false },
      { key: 'igpu', label: 'Integrated graphics', numeric: false, counted: false },
      PRICE,
    ],
    deltaFields: ['performanceIndex', 'l3Cache', 'tdp', 'price'],
    tags: [
      { tag: 'Gaming', fields: ['l3Cache', 'performanceIndex'], mode: 'anyLead' },
      { tag: 'Value', fields: ['price'], mode: 'anyLead' },
      { tag: 'Efficiency', fields: ['tdp'], mode: 'anyLead' },
    ],
  },

  gpu: {
    category: 'gpu',
    fields: [
      PERF,
      { key: 'vram', label: 'VRAM', unit: 'GB', direction: 'higher', numeric: true, counted: true, deltaFormat: 'absolute' },
      { key: 'vramType', label: 'VRAM type', numeric: false, counted: false },
      { key: 'boostClock', label: 'Boost clock', unit: 'MHz', direction: 'higher', numeric: true, counted: true, deltaFormat: 'absolute' },
      { key: 'cudaOrStream', label: 'Shaders (CUDA / Stream)', direction: 'higher', numeric: true, counted: true, deltaFormat: 'absolute' },
      { key: 'tbp', label: 'Total board power', unit: 'W', direction: 'lower', numeric: true, counted: true, deltaFormat: 'percent' },
      { key: 'busWidth', label: 'Memory bus', unit: 'bit', direction: 'higher', numeric: true, counted: true, deltaFormat: 'absolute' },
      { key: 'length', label: 'Length', unit: 'mm', numeric: false, counted: false },
      PRICE,
    ],
    deltaFields: ['performanceIndex', 'vram', 'tbp', 'price'],
    tags: [
      { tag: '4K / 1440p', fields: ['vram', 'performanceIndex'], mode: 'anyLead' },
      { tag: 'Value', fields: ['price'], mode: 'anyLead' },
      { tag: 'Efficiency', fields: ['tbp'], mode: 'anyLead' },
    ],
  },

  ram: {
    category: 'ram',
    fields: [
      PERF,
      { key: 'capacity', label: 'Capacity', unit: 'GB', direction: 'higher', numeric: true, counted: true, deltaFormat: 'absolute' },
      { key: 'speedMTs', label: 'Speed', unit: 'MT/s', direction: 'higher', numeric: true, counted: true, deltaFormat: 'absolute' },
      { key: 'casLatency', label: 'CAS latency', unit: 'CL', direction: 'lower', numeric: true, counted: true, deltaFormat: 'absolute' },
      { key: 'kitConfig', label: 'Kit', numeric: false, counted: false },
      { key: 'voltage', label: 'Voltage', unit: 'V', numeric: false, counted: false },
      { key: 'type', label: 'Type', numeric: false, counted: false },
      PRICE,
    ],
    deltaFields: ['performanceIndex', 'speedMTs', 'capacity', 'price'],
    tags: [
      { tag: 'Speed', fields: ['speedMTs', 'performanceIndex'], mode: 'anyLead' },
      { tag: 'Value', fields: ['price'], mode: 'anyLead' },
      { tag: 'Capacity', fields: ['capacity'], mode: 'anyLead' },
    ],
  },

  storage: {
    category: 'storage',
    fields: [
      PERF,
      // Common group — always compared, counts for cross-subtype tally (§11).
      { key: 'capacity', label: 'Capacity', unit: 'GB', direction: 'higher', numeric: true, counted: true, group: 'common', deltaFormat: 'absolute' },
      { key: 'seqRead', label: 'Sequential read', unit: 'MB/s', direction: 'higher', numeric: true, counted: true, group: 'common', deltaFormat: 'percent' },
      { key: 'seqWrite', label: 'Sequential write', unit: 'MB/s', direction: 'higher', numeric: true, counted: true, group: 'common', deltaFormat: 'percent' },
      { key: 'interface', label: 'Interface', numeric: false, counted: false, group: 'common' },
      { key: 'formFactor', label: 'Form factor', numeric: false, counted: false, group: 'common' },
      { key: 'pricePerTB', label: 'Price per TB', unit: 'AUD', direction: 'lower', numeric: true, counted: true, group: 'common', deltaFormat: 'currency' },
      // SSD-only group.
      { key: 'tbw', label: 'Endurance (TBW)', unit: 'TBW', direction: 'higher', numeric: true, counted: true, group: 'ssd', deltaFormat: 'absolute' },
      { key: 'randomIOPS', label: 'Random read', unit: 'IOPS', direction: 'higher', numeric: true, counted: true, group: 'ssd', deltaFormat: 'absolute' },
      { key: 'dram', label: 'DRAM cache', numeric: false, counted: false, group: 'ssd' },
      { key: 'nandType', label: 'NAND type', numeric: false, counted: false, group: 'ssd' },
      // HDD-only group.
      { key: 'rpm', label: 'Spindle speed', unit: 'RPM', direction: 'higher', numeric: true, counted: true, group: 'hdd', deltaFormat: 'absolute' },
      { key: 'cacheMB', label: 'Cache', unit: 'MB', direction: 'higher', numeric: true, counted: true, group: 'hdd', deltaFormat: 'absolute' },
      PRICE,
    ],
    deltaFields: ['performanceIndex', 'seqRead', 'pricePerTB', 'price'],
    tags: [
      { tag: 'Speed', fields: ['seqRead', 'performanceIndex'], mode: 'anyLead' },
      { tag: 'Value', fields: ['pricePerTB'], mode: 'anyLead' },
      { tag: 'Capacity', fields: ['capacity'], mode: 'anyLead' },
      { tag: 'Endurance', fields: ['tbw'], mode: 'anyLead', requiresSubtype: 'ssd' },
      { tag: 'Workload', fields: ['rpm', 'cacheMB'], mode: 'anyLead', requiresSubtype: 'hdd' },
    ],
  },

  // ── Non-benchmarked comparable categories (no performance index) ──
  cooler: {
    category: 'cooler',
    fields: [
      { key: 'type', label: 'Type', numeric: false, counted: false },
      { key: 'tdpRating', label: 'Cooling capacity', unit: 'W', direction: 'higher', numeric: true, counted: true, deltaFormat: 'absolute' },
      { key: 'noiseDb', label: 'Noise', unit: 'dB', direction: 'lower', numeric: true, counted: true, deltaFormat: 'absolute' },
      { key: 'height', label: 'Height', unit: 'mm', numeric: false, counted: false },
      { key: 'radiatorSize', label: 'Radiator', unit: 'mm', numeric: false, counted: false },
      { key: 'socketSupport', label: 'Sockets', numeric: false, counted: false },
      PRICE,
    ],
    deltaFields: ['tdpRating', 'noiseDb', 'price'],
    tags: [
      { tag: 'Cooling', fields: ['tdpRating'], mode: 'anyLead' },
      { tag: 'Quiet', fields: ['noiseDb'], mode: 'anyLead' },
      { tag: 'Value', fields: ['price'], mode: 'anyLead' },
    ],
  },

  case: {
    category: 'case',
    fields: [
      { key: 'type', label: 'Type', numeric: false, counted: false },
      { key: 'maxGpuLength', label: 'Max GPU length', unit: 'mm', direction: 'higher', numeric: true, counted: true, deltaFormat: 'absolute' },
      { key: 'maxCoolerHeight', label: 'Max cooler height', unit: 'mm', direction: 'higher', numeric: true, counted: true, deltaFormat: 'absolute' },
      { key: 'formFactorSupport', label: 'Motherboard support', numeric: false, counted: false },
      { key: 'radiatorSupport', label: 'Radiator support', numeric: false, counted: false },
      { key: 'sidePanel', label: 'Side panel', numeric: false, counted: false },
      { key: 'color', label: 'Colour', numeric: false, counted: false },
      PRICE,
    ],
    deltaFields: ['maxGpuLength', 'maxCoolerHeight', 'price'],
    tags: [
      { tag: 'Big GPUs', fields: ['maxGpuLength'], mode: 'anyLead' },
      { tag: 'Tall coolers', fields: ['maxCoolerHeight'], mode: 'anyLead' },
      { tag: 'Value', fields: ['price'], mode: 'anyLead' },
    ],
  },

  psu: {
    category: 'psu',
    fields: [
      { key: 'wattage', label: 'Wattage', unit: 'W', direction: 'higher', numeric: true, counted: true, deltaFormat: 'absolute' },
      { key: 'efficiency', label: 'Efficiency', numeric: false, counted: false },
      { key: 'modular', label: 'Modularity', numeric: false, counted: false },
      { key: 'formFactor', label: 'Form factor', numeric: false, counted: false },
      { key: 'connectors', label: 'Connectors', numeric: false, counted: false },
      PRICE,
    ],
    deltaFields: ['wattage', 'price'],
    tags: [
      { tag: 'Headroom', fields: ['wattage'], mode: 'anyLead' },
      { tag: 'Value', fields: ['price'], mode: 'anyLead' },
    ],
  },

  monitor: {
    category: 'monitor',
    fields: [
      { key: 'refreshHz', label: 'Refresh rate', unit: 'Hz', direction: 'higher', numeric: true, counted: true, deltaFormat: 'absolute' },
      { key: 'size', label: 'Size', unit: '"', direction: 'higher', numeric: true, counted: true, deltaFormat: 'absolute' },
      { key: 'resolution', label: 'Resolution', numeric: false, counted: false },
      { key: 'panelType', label: 'Panel', numeric: false, counted: false },
      { key: 'ports', label: 'Ports', numeric: false, counted: false },
      PRICE,
    ],
    deltaFields: ['refreshHz', 'size', 'price'],
    tags: [
      { tag: 'High refresh', fields: ['refreshHz'], mode: 'anyLead' },
      { tag: 'Immersive', fields: ['size'], mode: 'anyLead' },
      { tag: 'Value', fields: ['price'], mode: 'anyLead' },
    ],
  },
};

export function getCompareConfig(category: CompareCategory): CategoryCompareConfig {
  const cfg = COMPARE_CONFIGS[category];
  if (!cfg) throw new Error(`No compare config for category "${category}"`);
  return cfg;
}
