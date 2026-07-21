import { describe, it, expect } from 'vitest';
import { benchmarkUbRaw, gpuKey } from '../src/services/catalog/benchmarkIndex.js';

describe('benchmark index (DB-5 derivation)', () => {
  it('parses chipset strings to lookup keys', () => {
    expect(gpuKey('GeForce RTX 4070')).toBe('rtx4070');
    expect(gpuKey('GeForce RTX 4070 SUPER')).toBe('rtx4070super');
    expect(gpuKey('Radeon RX 7800 XT')).toBe('rx7800xt');
    expect(gpuKey('Radeon RX 7900 XTX')).toBe('rx7900xtx');
    expect(gpuKey('Arc B580')).toBe('arcb580');
  });

  it('GPU raw preserves ordering (4090 > 4070 > 4060)', () => {
    const g = (c: string) => benchmarkUbRaw('gpu', { chipset: c })!;
    expect(g('GeForce RTX 4090')).toBeGreaterThan(g('GeForce RTX 4070'));
    expect(g('GeForce RTX 4070')).toBeGreaterThan(g('GeForce RTX 4060'));
    expect(g('GeForce RTX 4070')).toBe(80); // reference
  });

  it('RAM raw scales with speed and DDR5 > DDR4', () => {
    const r = (type: string, speedMTs: number) => benchmarkUbRaw('ram', { type, speedMTs })!;
    expect(r('DDR5', 6000)).toBeGreaterThan(r('DDR5', 5600));
    expect(r('DDR5', 5600)).toBe(161); // reference
    expect(r('DDR5', 6000)).toBeGreaterThan(r('DDR4', 3600));
  });

  it('storage raw ranks NVMe Gen4 >> SATA SSD >> HDD', () => {
    const s = (specs: Record<string, string>) => benchmarkUbRaw('storage', specs)!;
    const gen4 = s({ interface: 'PCIe 4.0 NVMe', subtype: 'ssd', formFactor: 'M.2 2280' });
    const sata = s({ interface: 'SATA III', subtype: 'ssd', formFactor: '2.5"' });
    const hdd = s({ subtype: 'hdd', formFactor: '3.5"' });
    expect(gen4).toBeGreaterThan(sata);
    expect(sata).toBeGreaterThan(hdd);
  });

  it('returns null for underivable specs', () => {
    expect(benchmarkUbRaw('gpu', { chipset: 'Unknown 9999' })).toBeNull();
    expect(benchmarkUbRaw('ram', {})).toBeNull();
  });
});
