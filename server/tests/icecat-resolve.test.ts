import { describe, it, expect } from 'vitest';
import { IcecatClient, type IcecatData } from '../src/services/catalog/icecat/client.js';
import { IcecatSpecSource } from '../src/services/catalog/icecat/source.js';

/** A mock Icecat datasheet for an MSI RTX 4070 (brand+MPN lookup). */
const datasheet: IcecatData = {
  GeneralInfo: {
    IcecatId: 123456,
    Brand: 'MSI',
    ProductName: 'GeForce RTX 4070 GAMING X TRIO 12G',
    GTIN: ['4711377170925'],
    Title: 'MSI GeForce RTX 4070 GAMING X TRIO 12G NVIDIA 12 GB GDDR6X',
  },
  Image: { Pic500x500: 'https://images.icecat.biz/img/rtx4070.jpg' },
  FeaturesGroups: [
    {
      FeatureGroup: { Name: { Value: 'Graphics' } },
      Features: [
        { Feature: { Name: { Value: 'Graphics processor' } }, PresentationValue: 'GeForce RTX 4070' },
        { Feature: { Name: { Value: 'Discrete graphics card memory' } }, RawValue: '12', PresentationValue: '12 GB' },
        { Feature: { Name: { Value: 'Graphics card memory type' } }, PresentationValue: 'GDDR6X' },
        { Feature: { Name: { Value: 'Length' } }, RawValue: '337', PresentationValue: '337 mm' },
        { Feature: { Name: { Value: 'Product colour' } }, PresentationValue: 'Black' },
        { Feature: { Name: { Value: 'Minimum system power supply' } }, RawValue: '650', PresentationValue: '650 W' },
      ],
    },
  ],
};

// Mock fetcher returns the Icecat JSON envelope { data: <datasheet> }.
const mockFetcher = async () => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ data: datasheet }),
});

describe('Icecat resolver (brand + MPN → GTIN + specs + image + colour)', () => {
  const client = new IcecatClient({ username: 'test' }, mockFetcher);
  const source = new IcecatSpecSource(client);

  it('captures the GTIN from the datasheet', async () => {
    const part = await source.enrich({ category: 'gpu', id: { brand: 'MSI', productCode: 'RTX 4070 GAMING X TRIO 12G' } });
    expect(part).not.toBeNull();
    expect(part!.gtin).toBe('4711377170925');
  });

  it('normalizes specs, image and colour in one call', async () => {
    const part = await source.enrich({ category: 'gpu', id: { brand: 'MSI', productCode: 'RTX 4070 GAMING X TRIO 12G' } });
    expect(part!.brand).toBe('MSI');
    expect(part!.name).toContain('RTX 4070');
    expect(part!.specs.vram).toBe(12);
    expect(part!.specs.length).toBe(337);
    expect(String(part!.specs.color)).toBe('Black');
    expect(part!.imageUrl).toBe('https://images.icecat.biz/img/rtx4070.jpg');
  });
});
