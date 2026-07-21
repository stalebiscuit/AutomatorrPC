import { describe, it, expect } from 'vitest';
import { estimateWattage, recommendPsu, wattageEstimate } from '../src/wattage.js';
import { mkComponent, build, goodBuild } from './fixtures.js';

describe('wattage', () => {
  it('draws 0 W for an empty build (baseline only applies with real parts)', () => {
    expect(estimateWattage([])).toBe(0);
  });

  it('adds CPU TDP and GPU TBP plus per-part overhead', () => {
    const cpu = mkComponent('cpu', { tdp: 105 });
    const gpu = mkComponent('gpu', { tbp: 250 });
    // baseline 30 + cpu 105 + gpu 250 = 385
    expect(estimateWattage(build(['cpu', cpu], ['gpu', gpu]))).toBe(385);
  });

  it('recommends a standard PSU size with ~30% headroom, rounded up', () => {
    expect(recommendPsu(500)).toBe(650); // 500*1.3=650
    expect(recommendPsu(400)).toBe(550); // 520 -> 550
    expect(recommendPsu(20)).toBe(450); // floor size
  });

  it('produces both estimate and recommendation for a real build', () => {
    const w = wattageEstimate(goodBuild());
    expect(w.estimatedWatts).toBeGreaterThan(0);
    expect(w.recommendedPsuWatts).toBeGreaterThanOrEqual(w.estimatedWatts);
  });
});

describe('wattage — empty build (regression: showed 30 W for nothing)', () => {
  it('estimates 0 W when no parts are selected', () => {
    expect(estimateWattage([])).toBe(0);
  });

  it('applies the baseline overhead once a part is present', () => {
    const cpu = mkComponent('cpu', { socket: 'AM5', tdp: 65 });
    expect(estimateWattage(build(['cpu', cpu]))).toBeGreaterThan(0);
  });
});
