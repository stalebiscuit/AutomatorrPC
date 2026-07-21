import { describe, it, expect } from 'vitest';
import { auditCatalogue, type AuditPart } from '../src/services/catalog/db8Audit.js';

/** Minimal builder-ready-ish part factory (specs kept simple; identity logic is name/brand-driven). */
function part(p: Partial<AuditPart> & { category: AuditPart['category']; brand: string; name: string; slug: string }): AuditPart {
  return {
    gtin: null,
    imageUrl: null,
    specs: {},
    priceCount: 0,
    ...p,
  };
}

const clustersOf = (parts: AuditPart[], cat: string) =>
  auditCatalogue(parts, 'seed').categories.find((c) => c.category === cat)!.clusters;

describe('DB-8 audit — duplicate detection precision', () => {
  it('does NOT merge distinct GPU models (4070 vs 4090)', () => {
    const parts = [
      part({ category: 'gpu', brand: 'NVIDIA', name: 'NVIDIA GeForce RTX 4070', slug: 'rtx-4070' }),
      part({ category: 'gpu', brand: 'NVIDIA', name: 'NVIDIA GeForce RTX 4090', slug: 'rtx-4090' }),
    ];
    expect(clustersOf(parts, 'gpu')).toHaveLength(0);
  });

  it('does NOT merge distinct RAM capacities (32GB vs 64GB of the same line)', () => {
    const parts = [
      part({ category: 'ram', brand: 'G.SKILL', name: 'G.Skill Trident Z5 DDR5-6000 CL30 32GB (2×16GB)', slug: 'tz5-32' }),
      part({ category: 'ram', brand: 'G.SKILL', name: 'G.Skill Trident Z5 DDR5-6000 CL30 64GB (2×32GB)', slug: 'tz5-64' }),
    ];
    expect(clustersOf(parts, 'ram')).toHaveLength(0);
  });

  it('does NOT merge distinct PSU wattages (Raider 550 vs 750)', () => {
    const parts = [
      part({ category: 'psu', brand: 'FSP', name: 'FSP Group Raider 550', slug: 'raider-550' }),
      part({ category: 'psu', brand: 'FSP', name: 'FSP Group Raider 750', slug: 'raider-750' }),
    ];
    expect(clustersOf(parts, 'psu')).toHaveLength(0);
  });

  it('HIGH-merges the same product with junk parenthetical suffixes', () => {
    const parts = [
      part({ category: 'psu', brand: 'Corsair', name: 'Corsair RM750e (2023)', slug: 'rm750e-2023', imageUrl: '/x.svg', priceCount: 3 }),
      part({ category: 'psu', brand: 'Corsair', name: 'Corsair RM750e  (19)', slug: 'rm750e-19' }),
    ];
    const clusters = clustersOf(parts, 'psu');
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.confidence).toBe('high');
    expect(clusters[0]!.keeper).toBe('rm750e-2023'); // has image + prices
  });

  it('HIGH-merges verbose Icecat packaging words onto a clean seed name', () => {
    const parts = [
      part({ category: 'psu', brand: 'MSI', name: 'MSI MAG A650BN', slug: 'msi-a650bn' }),
      part({ category: 'psu', brand: 'MSI', name: 'MSI MAG A650BN ATX Power Supply Unit Non Modular UK', slug: 'msi-a650bn-verbose' }),
    ];
    const clusters = clustersOf(parts, 'psu');
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.confidence).toBe('high');
  });

  it('flags RGB/colour variants as REVIEW, never HIGH', () => {
    const parts = [
      part({ category: 'cooler', brand: 'ENDORFY', name: 'ENDORFY Spartan 5', slug: 'spartan-5' }),
      part({ category: 'cooler', brand: 'ENDORFY', name: 'ENDORFY Spartan 5 ARGB', slug: 'spartan-5-argb' }),
    ];
    const clusters = clustersOf(parts, 'cooler');
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.confidence).toBe('review');
  });

  it('treats a parenthetical (White) as a variant, not a high-confidence dup', () => {
    const parts = [
      part({ category: 'cooler', brand: 'ARCTIC', name: 'ARCTIC Liquid Freezer III Pro 360 A-RGB', slug: 'lf3-pro-360', specs: { socketSupport: 'AM5,LGA1700' } }),
      part({ category: 'cooler', brand: 'ARCTIC', name: 'ARCTIC Liquid Freezer III Pro 360 A-RGB (White)', slug: 'lf3-pro-360-white', specs: { socketSupport: 'AM5,LGA1700' } }),
    ];
    const clusters = clustersOf(parts, 'cooler');
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.confidence).toBe('review'); // white variant → review/keep, never auto-merged
  });

  it('does NOT merge revision variants (V3) at HIGH confidence', () => {
    const parts = [
      part({ category: 'psu', brand: 'Cooler Master', name: 'Cooler Master MWE Gold 750', slug: 'mwe-750' }),
      part({ category: 'psu', brand: 'Cooler Master', name: 'Cooler Master MWE Gold 750 V3', slug: 'mwe-750-v3' }),
    ];
    const high = clustersOf(parts, 'psu').filter((c) => c.confidence === 'high');
    expect(high).toHaveLength(0);
  });
});

describe('DB-8 audit — junk, name quality & coverage', () => {
  it('reports near-empty specs and truncated names', () => {
    const parts = [
      part({ category: 'case', brand: 'Zalman', name: 'Zalman T8', slug: 'zalman-t8', specs: {} }),
      part({ category: 'cooler', brand: 'ARCTIC', name: 'ARCTIC Freezer 36 A-RGB Tower CPU Cooler with', slug: 'arctic-36-with', specs: { socketSupport: 'AM5' } }),
    ];
    const rep = auditCatalogue(parts, 'seed');
    const caseCat = rep.categories.find((c) => c.category === 'case')!;
    const coolerCat = rep.categories.find((c) => c.category === 'cooler')!;
    expect(caseCat.nearEmpty).toContain('zalman-t8');
    expect(coolerCat.nameIssues.some((n) => n.slug === 'arctic-36-with' && n.issue === 'truncated')).toBe(true);
  });

  it('reports compatibility coverage gaps (socket with no cooler/mobo)', () => {
    const parts = [
      part({ category: 'cpu', brand: 'AMD', name: 'AMD FX-8350', slug: 'fx-8350', specs: { socket: 'AM3+' } }),
      // no AM3+ motherboard, no cooler listing AM3+
      part({ category: 'motherboard', brand: 'ASUS', name: 'ASUS B650', slug: 'b650', specs: { socket: 'AM5', ramType: 'DDR5' } }),
      part({ category: 'cooler', brand: 'Noctua', name: 'Noctua NH-D15', slug: 'nhd15', specs: { socketSupport: 'AM5,LGA1700' } }),
    ];
    const gaps = auditCatalogue(parts, 'seed').coverage;
    expect(gaps.some((g) => g.kind === 'socket-no-mobo' && g.value === 'AM3+')).toBe(true);
    expect(gaps.some((g) => g.kind === 'socket-no-cooler' && g.value === 'AM3+')).toBe(true);
  });
});
