import { describe, it, expect } from 'vitest';
import { titleMatches } from '../src/services/pricing/retailers/types.js';

describe('titleMatches — exact-SKU matching', () => {
  it('matches the same SKU even with retailer marketing suffixes', () => {
    expect(
      titleMatches(
        'ASUS GeForce RTX 5090 ROG Astral OC 32GB GDDR7',
        'ASUS GeForce RTX 5090 ROG Astral OC 32GB GDDR7 Graphics Card',
      ),
    ).toBe(true);
  });

  it('tolerates an omitted memory-type word (GDDR7)', () => {
    expect(
      titleMatches(
        'ASUS GeForce RTX 5090 ROG Astral OC 32GB GDDR7',
        'ASUS ROG Astral GeForce RTX 5090 OC 32GB',
      ),
    ).toBe(true);
  });

  it('rejects a different variant of the same card (the reported bug)', () => {
    const comp = 'ASUS GeForce RTX 5090 ROG Astral OC 32GB GDDR7';
    expect(titleMatches(comp, 'ASUS GeForce RTX 5090 ROG Astral BTF OC 32GB GDDR7')).toBe(false);
    expect(titleMatches(comp, 'ASUS GeForce RTX 5090 ROG Astral LC OC 32GB GDDR7')).toBe(false);
  });

  it('distinguishes Ti / Super / XT / XTX', () => {
    expect(titleMatches('NVIDIA GeForce RTX 4070', 'GeForce RTX 4070 Ti 12GB')).toBe(false);
    expect(titleMatches('NVIDIA GeForce RTX 4070 Ti', 'GeForce RTX 4070 12GB')).toBe(false);
    expect(titleMatches('GeForce RTX 4070 Ti', 'GeForce RTX 4070 Ti Super')).toBe(false);
    expect(titleMatches('Radeon RX 7900 XT', 'Radeon RX 7900 XTX')).toBe(false);
  });

  it('rejects the same chip from a different brand / product line', () => {
    expect(
      titleMatches(
        'ASUS GeForce RTX 5090 ROG Astral OC 32GB',
        'Gigabyte GeForce RTX 5090 Gaming OC 32GB',
      ),
    ).toBe(false);
  });

  it('distinguishes capacity', () => {
    expect(
      titleMatches('Corsair Vengeance 16GB DDR5 6000', 'Corsair Vengeance 32GB DDR5 6000'),
    ).toBe(false);
  });

  it('distinguishes CPU SKUs (model + K/KF suffix)', () => {
    expect(titleMatches('AMD Ryzen 7 9800X3D', 'AMD Ryzen 7 9800X3D Processor')).toBe(true);
    expect(titleMatches('AMD Ryzen 7 9800X3D', 'AMD Ryzen 9 9900X3D')).toBe(false);
    expect(titleMatches('Intel Core i9-14900K', 'Intel Core i9-14900KF')).toBe(false);
    expect(titleMatches('Intel Core i9-14900K', 'Intel Core i9-14900K Processor')).toBe(true);
  });

  it('handles space-separated capacity ("32 GB")', () => {
    expect(
      titleMatches('Kingston Fury 32GB DDR5 6000', 'Kingston Fury 32 GB DDR5 6000 MHz'),
    ).toBe(true);
  });

  it('returns false for empty card text', () => {
    expect(titleMatches('AMD Ryzen 7 9800X3D', '')).toBe(false);
  });
});
