import type { BuilderCategory, Specs } from '@automatorr/shared';

const BRAND = '/images/brand/';

/** Local brand logo (Intel/AMD/NVIDIA), matched on brand + name so an AIB GPU like
 *  "ASUS GeForce RTX 5090" still resolves to the NVIDIA logo. null when none is shipped. */
export function brandLogo(brand: string, name: string): string | null {
  const s = `${brand} ${name}`.toLowerCase();
  if (s.includes('intel')) return `${BRAND}intel.svg`;
  if (s.includes('geforce') || s.includes('nvidia')) return `${BRAND}nvidia.svg`;
  if (s.includes('radeon') || s.includes('amd')) return `${BRAND}amd.svg`;
  return null;
}

/**
 * A local "concept" render for a part — a branded illustration preferred over the plain wireframe
 * CategoryRender placeholder. Brand logo for CPU/GPU; the DDR5 render for RAM; the matching drive
 * render for storage. null when we ship no concept art for the category (→ wireframe placeholder).
 */
export function conceptAsset(
  category: BuilderCategory,
  brand: string,
  name: string,
  specs?: Specs,
): string | null {
  if (category === 'cpu' || category === 'gpu') return brandLogo(brand, name);
  if (category === 'ram') return '/images/ram/ddr5.svg';
  if (category === 'storage') {
    const s = `${name} ${String(specs?.interface ?? '')} ${String(specs?.formFactor ?? '')}`.toLowerCase();
    if (/\bm\.?2\b|nvme|pcie|gen\s?\d/.test(s)) return '/images/storage/m2.svg';
    if (/\bhdd\b|hard\s?drive|3\.5|7200|5400|rpm/.test(s)) return '/images/storage/hdd.svg';
    return '/images/storage/ssd25.svg';
  }
  return null;
}
