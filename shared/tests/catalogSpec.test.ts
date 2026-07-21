import { describe, it, expect } from 'vitest';
import { validateSpecs, isBuilderReady, CATEGORY_SPEC_SCHEMA } from '../src/catalogSpec.js';
import { BUILDER_CATEGORIES } from '../src/types.js';
import { mkComponent } from './fixtures.js';

describe('catalogSpec', () => {
  it('has a schema for every builder category', () => {
    for (const c of BUILDER_CATEGORIES) {
      expect(CATEGORY_SPEC_SCHEMA[c].length).toBeGreaterThan(0);
    }
  });

  it('passes a fully-specced motherboard', () => {
    const v = validateSpecs('motherboard', { socket: 'AM5', ramType: 'DDR5', formFactor: 'ATX', ramSlots: 4 });
    expect(v.builderReady).toBe(true);
    expect(v.missing).toHaveLength(0);
  });

  it('gates out a motherboard missing a critical field (formFactor)', () => {
    const v = validateSpecs('motherboard', { socket: 'AM5', ramType: 'DDR5', ramSlots: 4 });
    expect(v.builderReady).toBe(false);
    expect(v.missingCritical).toContain('formFactor');
  });

  it('treats list specs (case support fields) as present only when non-empty', () => {
    const missing = validateSpecs('case', { maxGpuLength: 360, maxCoolerHeight: 170 });
    expect(missing.missingCritical).toContain('formFactorSupport');
    const ok = validateSpecs('case', {
      formFactorSupport: 'ATX,Micro-ATX', maxGpuLength: 360, maxCoolerHeight: 170,
    });
    expect(ok.builderReady).toBe(true);
  });

  it('OS/monitor have no critical fields (never gated on compatibility)', () => {
    expect(validateSpecs('os', { edition: 'Home' }).builderReady).toBe(true);
    expect(validateSpecs('monitor', { resolution: '2560x1440', refreshHz: 165 }).builderReady).toBe(true);
  });

  it('isBuilderReady works on a Component', () => {
    const ready = mkComponent('gpu', { length: 300, tbp: 200, vram: 12 });
    const notReady = mkComponent('gpu', { tbp: 200, vram: 12 }); // no length
    expect(isBuilderReady(ready)).toBe(true);
    expect(isBuilderReady(notReady)).toBe(false);
  });
});
