import type { CategoryMeta } from '@automatorr/shared';

/** The four in-scope categories + display metadata (spec §2, §8). */
export const CATEGORY_META: CategoryMeta[] = [
  { id: 'cpu', label: 'CPU', blurb: 'Processors — cores, clocks and cache.' },
  { id: 'gpu', label: 'GPU', blurb: 'Graphics cards — VRAM, shaders and throughput.' },
  { id: 'ram', label: 'RAM', blurb: 'Memory kits — capacity, speed and latency.' },
  { id: 'storage', label: 'Storage', blurb: 'SSDs & HDDs — throughput, capacity and value.' },
];
