import { describe, it, expect } from 'vitest';
import { cleanProductName, needsRename, reviewMergeAction, stripColourSuffix, planFixes, type FullPart } from '../src/services/catalog/db8Fix.js';

describe('DB-8 fix — name cleaning', () => {
  it('shortens the real verbose Icecat names to clean product names', () => {
    expect(cleanProductName("MSI MAG CORELIQUID 360R CPU AIO Cooler ' 360mm Radiator, 3x 120mm ARGB PWM Fan'")).toBe('MSI MAG CORELIQUID 360R');
    expect(cleanProductName('ARCTIC Freezer 36 A-RGB (Black) Multi Compatible Tower CPU Cooler with')).toBe('ARCTIC Freezer 36 A-RGB (Black)');
    expect(cleanProductName("MSI MAG FORGE 100R Mid Tower Gaming Computer Case 'Black, 2x 120mm ARGB'")).toBe('MSI MAG FORGE 100R');
    expect(cleanProductName("MSI MAG A650BN UK PSU '650W, 80 Plus Bronze certified'")).toBe('MSI MAG A650BN');
    expect(cleanProductName('ARCTIC Liquid Freezer II 360 Series')).toBe('ARCTIC Liquid Freezer II 360');
    expect(cleanProductName('Corsair RM750e (2023)')).toBe('Corsair RM750e');
  });

  it('leaves already-clean names untouched', () => {
    for (const n of ['NZXT H9 Flow', 'be quiet! Pure Rock 3 Black', 'AMD Ryzen 5 3600', 'Corsair 4000D Airflow']) {
      expect(cleanProductName(n)).toBe(n);
    }
  });

  it('preserves inch marks in monitor names (does not cut at ")', () => {
    expect(cleanProductName('Dell S2721DGF 27" QHD 165Hz')).toBe('Dell S2721DGF 27" QHD 165Hz');
    expect(cleanProductName('LG 27GR93U 27" 4K 144Hz')).toBe('LG 27GR93U 27" 4K 144Hz');
    expect(cleanProductName("Samsung Odyssey G3 27' FHD 165")).toBe("Samsung Odyssey G3 27' FHD 165");
    expect(needsRename('Dell S2721DGF 27" QHD 165Hz')).toBe(false);
  });

  it('flags verbose/truncated names for rename, not clean ones', () => {
    expect(needsRename('ARCTIC Freezer 36 A-RGB (Black) Multi Compatible Tower CPU Cooler with')).toBe(true);
    expect(needsRename("MSI MAG A650BN UK PSU '650W'")).toBe(true);
    expect(needsRename('NZXT H9 Flow')).toBe(false);
  });
});

describe('DB-8 fix — review merge classification (colour-only collapse)', () => {
  it('MERGES pure-colour differences (base+colour, black-vs-white)', () => {
    expect(reviewMergeAction(['be quiet! Pure Rock 3', 'be quiet! Pure Rock 3 Black'])).toBe('merge');
    expect(reviewMergeAction(['be quiet! Pure Base 500DX', 'be quiet! Pure Base 500DX Black'])).toBe('merge');
    expect(reviewMergeAction(['Kingston FURY Beast', 'Kingston FURY Beast Black'])).toBe('merge');
    expect(reviewMergeAction(['ASUS DUAL-RTX5060TI-O16G', 'ASUS DUAL-RTX5060TI-O16G-WHITE'])).toBe('merge');
    expect(reviewMergeAction(['Super Flower SF-1200F14MP Black', 'Super Flower SF-1200F14MP White'])).toBe('merge');
    // both A-RGB, differ only by colour → the lighting matches, so the colour folds
    expect(reviewMergeAction(['ARCTIC Liquid Freezer III Pro 360 A-RGB', 'ARCTIC Liquid Freezer III Pro 360 A-RGB (White)'])).toBe('merge');
  });

  it('KEEPS lighting / efficiency variants distinct (rgb, argb, gold-vs-bronze)', () => {
    expect(reviewMergeAction(['Cooler Master Hyper 212 Black Edition', 'Cooler Master Hyper 212 RGB Black Edition'])).toBe('keep');
    expect(reviewMergeAction(['Corsair NAUTILUS 360 RS', 'Corsair NAUTILUS 360 RS ARGB'])).toBe('keep');
    expect(reviewMergeAction(['ENDORFY Spartan 5', 'ENDORFY Spartan 5 ARGB'])).toBe('keep');
    expect(reviewMergeAction(['Cooler Master MWE V3 650W Gold', 'Cooler Master MWE V3 650W Bronze'])).toBe('keep');
  });
});

describe('DB-8 fix — colour-neutral keeper names', () => {
  it('strips a trailing colour tag from a collapsed keeper', () => {
    expect(stripColourSuffix('Jonsbo D300 mATX Case (Black)')).toBe('Jonsbo D300 mATX Case');
    expect(stripColourSuffix('Corsair RM750e - 750W Gold ATX 3.1 Modular PSU (White)')).toBe('Corsair RM750e - 750W Gold ATX 3.1 Modular PSU');
    expect(stripColourSuffix('ASUS ROG Strix Helios II Mid Tower eATX Case - White')).toBe('ASUS ROG Strix Helios II Mid Tower eATX Case');
    expect(stripColourSuffix('Jonsplus Z20 SFF 20L mATX Case (White/Pink)')).toBe('Jonsplus Z20 SFF 20L mATX Case');
  });
  it('leaves non-colour names (and PSU efficiency) untouched', () => {
    expect(stripColourSuffix('Cooler Master MWE V3 650W Gold')).toBe('Cooler Master MWE V3 650W Gold');
    expect(stripColourSuffix('NZXT H9 Flow')).toBe('NZXT H9 Flow');
  });
});

describe('DB-8 fix — spacing repair on crawled names', () => {
  it('re-inserts spaces the crawl dropped, without touching model codes', () => {
    expect(cleanProductName('FSP M580 PRO Mid Tower Dual-ChamberCase')).toBe('FSP M580 PRO Mid Tower Dual-Chamber Case');
    expect(cleanProductName('Jonsbo N2 - SFF 11L Mini-ITX 5-BayNAS Case')).toBe('Jonsbo N2 - SFF 11L Mini-ITX 5-Bay NAS Case');
    expect(cleanProductName('MSI MAG A850GL - 850W GoldPCIe 5.0 ATX Modular PSU (White)')).toBe('MSI MAG A850GL - 850W Gold PCIe 5.0 ATX Modular PSU (White)');
    expect(cleanProductName('ASUS PRIME-RX9070XT-O16G')).toBe('ASUS PRIME-RX9070XT-O16G'); // model code untouched
  });
});

const part = (p: Partial<FullPart> & { category: FullPart['category']; brand: string; name: string; slug: string }): FullPart => ({
  gtin: null, imageUrl: null, specs: {}, priceCount: 0, prices: [], ...p,
});

describe('DB-8 fix — plan safety', () => {
  it('never merges different capacities (ram/storage) — routes to manual', () => {
    const parts = [
      part({ category: 'storage', brand: 'Samsung', name: 'Samsung 990 PRO', slug: 'samsung-990-pro', gtin: 'X', specs: { capacity: 2000, interface: 'PCIe 4.0' } }),
      part({ category: 'storage', brand: 'Samsung', name: 'Samsung 990 PRO 1 TB', slug: 'samsung-990-pro-1-tb', gtin: 'X', specs: { capacity: 1000, interface: 'PCIe 4.0' } }),
    ];
    const plan = planFixes(parts);
    expect(plan.merges).toHaveLength(0);
    expect(plan.manual.some((m) => m.slugs.includes('samsung-990-pro'))).toBe(true);
  });

  it('merges a high junk-suffix cluster and adopts the clean name', () => {
    const parts = [
      part({ category: 'psu', brand: 'Corsair', name: 'Corsair RM750e (2023)', slug: 'corsair-rm750e-2023', imageUrl: '/x.svg', prices: [{ store: 'Mwave', price: 149, url: 'https://m' }] }),
      part({ category: 'psu', brand: 'Corsair', name: 'Corsair RM750e  (19)', slug: 'corsair-rm750e-19', prices: [{ store: 'Scorptec', price: 145, url: 'https://s' }] }),
    ];
    const plan = planFixes(parts);
    expect(plan.merges).toHaveLength(1);
    expect(plan.merges[0]!.mergedName).toBe('Corsair RM750e');
    expect(plan.merges[0]!.dropSlugs).toEqual(['corsair-rm750e-19']);
  });

  it('deletes near-empty + not-ready junk', () => {
    const parts = [part({ category: 'case', brand: 'Zalman', name: 'Zalman T8', slug: 'zalman-t8', specs: {} })];
    const plan = planFixes(parts);
    expect(plan.deletions.some((d) => d.slug === 'zalman-t8')).toBe(true);
  });

  it('merges verbose Icecat pairs that clean to the same name (not two colliding renames)', () => {
    const parts = [
      part({ category: 'case', brand: 'MSI', name: "MSI MAG FORGE 100R Mid Tower Gaming Computer Case 'Black, 2x 120mm ARGB'", slug: 'forge-verbose', imageUrl: '/x.svg', specs: { formFactorSupport: 'ATX', maxGpuLength: 400, maxCoolerHeight: 175 } }),
      part({ category: 'case', brand: 'MSI', name: "MSI MAG FORGE 100R MidTower Gaming Computer Case 'Black", slug: 'forge-short', specs: { formFactorSupport: 'ATX', maxGpuLength: 400, maxCoolerHeight: 175 } }),
    ];
    const plan = planFixes(parts);
    expect(plan.merges).toHaveLength(1);
    expect(plan.merges[0]!.mergedName).toBe('MSI MAG FORGE 100R');
    expect(plan.renames).toHaveLength(0); // collapsed into the merge, no duplicate renames
  });

  it('routes unknown-capacity storage clusters (shared GTIN) to manual', () => {
    const parts = [
      part({ category: 'storage', brand: 'Samsung', name: 'Samsung 990 PRO', slug: 'samsung-990-pro', gtin: 'G', specs: { interface: 'PCIe 4.0' } }), // no capacity
      part({ category: 'storage', brand: 'Samsung', name: 'Samsung 990 PRO 1 TB', slug: 'samsung-990-pro-1-tb', gtin: 'G', specs: { capacity: 1000, interface: 'PCIe 4.0' } }),
    ];
    const plan = planFixes(parts);
    expect(plan.merges).toHaveLength(0);
    expect(plan.manual.some((m) => m.slugs.includes('samsung-990-pro'))).toBe(true);
  });
});
