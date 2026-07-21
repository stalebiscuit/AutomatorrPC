import { describe, it, expect } from 'vitest';
import { normaliseIndex, REFERENCES, REFERENCE_INDEX } from '../src/services/scoring.js';
import { getCompareConfig, COMPARE_CONFIGS } from '../src/services/compareConfig.js';
import { CATEGORIES } from '@automatorr/shared';

describe('scoring.normaliseIndex (spec §10)', () => {
  it('pins each category reference to exactly 1000', () => {
    for (const cat of CATEGORIES) {
      expect(normaliseIndex(cat, REFERENCES[cat].ubRaw)).toBe(REFERENCE_INDEX);
    }
  });

  it('scales proportionally and is UNCAPPED (>1000 allowed)', () => {
    // CPU reference raw = 122. i9-14900K raw 131 → above 1000.
    expect(normaliseIndex('cpu', 131)).toBe(Math.round((131 / 122) * 1000));
    expect(normaliseIndex('cpu', 131)).toBeGreaterThan(1000);
    // 7800X3D raw 121 → just below.
    expect(normaliseIndex('cpu', 121)).toBeLessThan(normaliseIndex('cpu', 131));
  });

  it('preserves UB ordering — Intel i9-14900K (131) outranks 7800X3D (121)', () => {
    expect(normaliseIndex('cpu', 131)).toBeGreaterThan(normaliseIndex('cpu', 121));
  });

  it('keeps storage SSDs far above HDDs on one category-wide scale', () => {
    const ssd = normaliseIndex('storage', 716); // WD SN8100
    const hdd = normaliseIndex('storage', 86.9); // Barracuda 2TB
    expect(ssd).toBeGreaterThan(hdd * 5);
  });

  it('rejects invalid input', () => {
    expect(() => normaliseIndex('cpu', -1)).toThrow();
    expect(() => normaliseIndex('cpu', Number.NaN)).toThrow();
  });
});

describe('compareConfig (spec §11)', () => {
  it('defines a config for every category', () => {
    for (const cat of CATEGORIES) {
      expect(getCompareConfig(cat).category).toBe(cat);
    }
  });

  it('CPU counts performanceIndex + boost + cache + tdp and treats socket as info', () => {
    const cfg = getCompareConfig('cpu');
    const byKey = new Map(cfg.fields.map((f) => [f.key, f]));
    expect(byKey.get('performanceIndex')?.counted).toBe(true);
    expect(byKey.get('tdp')?.direction).toBe('lower');
    expect(byKey.get('socket')?.numeric).toBe(false);
    expect(byKey.get('socket')?.counted).toBe(false);
  });

  it('storage groups fields into common / ssd / hdd and has a category-wide pricePerTB', () => {
    const cfg = COMPARE_CONFIGS.storage;
    const groups = new Set(cfg.fields.map((f) => f.group).filter(Boolean));
    expect(groups).toEqual(new Set(['common', 'ssd', 'hdd']));
    const ppt = cfg.fields.find((f) => f.key === 'pricePerTB');
    expect(ppt?.group).toBe('common');
    expect(ppt?.direction).toBe('lower');
  });
});
