import { describe, it, expect } from 'vitest';
import { decodeCrawledPart } from '../src/services/catalog/crawl/decodeSpecs.js';

describe('crawl decodeSpecs — name → builder-ready specs', () => {
  it('RAM: DDR5 kit', () => {
    const d = decodeCrawledPart('ram', 'Corsair Vengeance RGB DDR5-6000 CL30 32GB (2x16GB)')!;
    expect(d.specs).toMatchObject({ type: 'DDR5', speedMTs: 6000, capacity: 32, casLatency: 30 });
    expect(d.ubRaw).toBeGreaterThan(150);
    expect(d.builderReady).toBe(true);
  });
  it('GPU: chipset drives score + canonical VRAM', () => {
    const d = decodeCrawledPart('gpu', 'ASUS DUAL GeForce RTX 4070 OC 12GB')!;
    expect(d.specs).toMatchObject({ chipset: 'RTX 4070', vram: 12, tbp: 200 });
    expect(d.ubRaw).toBe(80);
    expect(d.builderReady).toBe(true);
  });
  it('Storage: capacity + interface + subtype', () => {
    const ssd = decodeCrawledPart('storage', 'Samsung 990 Pro 2TB NVMe PCIe 4.0 SSD')!;
    expect(ssd.specs).toMatchObject({ capacity: 2000, subtype: 'ssd', interface: 'NVMe PCIe 4.0' });
    const hdd = decodeCrawledPart('storage', 'Seagate BarraCuda 4TB 3.5" HDD')!;
    expect(hdd.specs).toMatchObject({ capacity: 4000, subtype: 'hdd' });
  });
  it('PSU: wattage + efficiency + modular', () => {
    const d = decodeCrawledPart('psu', 'Corsair RM850e 850W 80+ Gold Fully Modular ATX')!;
    expect(d.specs).toMatchObject({ wattage: 850, efficiency: '80+ Gold', modular: 'Full' });
    expect(d.builderReady).toBe(true);
  });
  it('Motherboard: chipset → socket', () => {
    const d = decodeCrawledPart('motherboard', 'ASUS ROG STRIX B650-A Gaming WiFi DDR5 ATX')!;
    expect(d.specs).toMatchObject({ socket: 'AM5', ramType: 'DDR5', formFactor: 'ATX' });
  });
  it('Monitor: resolution + refresh', () => {
    const d = decodeCrawledPart('monitor', 'LG UltraGear 27" QHD 165Hz Gaming Monitor')!;
    expect(d.specs).toMatchObject({ resolution: '2560x1440', refreshHz: 165, size: 27 });
  });
  it('returns null when the name is not decodable', () => {
    expect(decodeCrawledPart('gpu', 'Generic Graphics Accelerator')).toBeNull();
    expect(decodeCrawledPart('ram', 'Some Memory Module')).toBeNull();
  });
});
