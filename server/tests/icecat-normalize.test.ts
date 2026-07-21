import { describe, it, expect } from 'vitest';
import {
  cleanName,
  flattenFeatures,
  icecatToSpecs,
  normalizeIcecatProduct,
} from '../src/services/catalog/icecat/normalize.js';
import type { IcecatData } from '../src/services/catalog/icecat/client.js';

const cpuData: IcecatData = {
  GeneralInfo: {
    IcecatId: 123456,
    Title: 'AMD Ryzen 5 7600X',
    Brand: 'AMD',
    BrandPartCode: '100-100000593WOF',
    GTIN: ['0730143314444'],
    Category: { Name: { Value: 'Processors' } },
  },
  Image: { Pic500x500: 'https://images.icecat.biz/img/x.jpg', HighPic: 'https://images.icecat.biz/img/hi.jpg' },
  FeaturesGroups: [
    {
      FeatureGroup: { Name: { Value: 'Performance' } },
      Features: [
        { Feature: { Name: { Value: 'Processor socket' } }, RawValue: 'Socket AM5', PresentationValue: 'AM5' },
        { Feature: { Name: { Value: 'Thermal Design Power (TDP)' }, Measure: { Signs: { _: 'W' } } }, RawValue: '105', PresentationValue: '105 W' },
        { Feature: { Name: { Value: 'Processor cores' } }, RawValue: '6' },
      ],
    },
  ],
};

describe('icecat normalize', () => {
  it('flattens feature groups into a lowercased name→value map', () => {
    const flat = flattenFeatures(cpuData);
    expect(flat['processor socket']).toBe('Socket AM5');
    expect(flat['processor cores']).toBe('6');
  });

  it('maps + coerces features to our spec schema (numbers parsed)', () => {
    const specs = icecatToSpecs('cpu', flattenFeatures(cpuData));
    expect(String(specs.socket)).toMatch(/AM5/);
    expect(specs.tdp).toBe(105); // parsed from "105"
    expect(specs.cores).toBe(6);
  });

  it('normalizes a full product into a NormalizedPart', () => {
    const part = normalizeIcecatProduct(cpuData, 'cpu');
    expect(part).not.toBeNull();
    expect(part!.brand).toBe('AMD');
    expect(part!.name).toBe('AMD Ryzen 5 7600X');
    expect(part!.slug).toBe('amd-ryzen-5-7600x');
    expect(part!.imageUrl).toBe('https://images.icecat.biz/img/x.jpg');
    expect(part!.specSourceUrl).toContain('123456');
    expect(String(part!.specs.socket)).toMatch(/AM5/);
    expect(part!.unknownFields).not.toContain('socket'); // critical field present
  });

  it('returns null when brand/name are missing', () => {
    expect(normalizeIcecatProduct({ GeneralInfo: {} }, 'cpu')).toBeNull();
  });

  it('flags a missing critical field in unknownFields', () => {
    const noSocket: IcecatData = {
      GeneralInfo: { Title: 'Some CPU', Brand: 'AMD' },
      FeaturesGroups: [],
    };
    const part = normalizeIcecatProduct(noSocket, 'cpu');
    expect(part!.unknownFields).toContain('socket');
  });
});

describe('cleanName (naming scheme fix)', () => {
  it('strips a marketing description blob down to the product name', () => {
    const raw =
      "MSI MAG CORELIQUID 360R CPU AIO Cooler ' 360mm Radiator, 3x 120mm ARGB PWM Fan, Adjustable ARGB Dragon CPU Mount, Compatible with Intel and AMD Platforms";
    expect(cleanName(raw)).toBe('MSI MAG CORELIQUID 360R CPU AIO Cooler');
  });

  it('leaves an already-clean name unchanged', () => {
    expect(cleanName('Noctua NH-D15 chromax.black')).toBe('Noctua NH-D15 chromax.black');
  });

  it('caps an over-long name at a word boundary', () => {
    const raw = 'BrandX ' + 'SuperMegaUltra '.repeat(10) + 'Cooler';
    expect(cleanName(raw).length).toBeLessThanOrEqual(72);
  });

  it('falls back to a cleaned Title when ProductName is absent (no marketing blob stored)', () => {
    const data = {
      GeneralInfo: {
        Title: "MSI MAG CORELIQUID 360R CPU AIO Cooler ' 360mm Radiator, 3x 120mm Fan",
        Brand: 'MSI',
      },
      FeaturesGroups: [],
    };
    const part = normalizeIcecatProduct(data as never, 'cooler');
    expect(part!.name).toBe('MSI MAG CORELIQUID 360R CPU AIO Cooler');
    expect(part!.name).not.toContain(',');
  });
});

describe('capacity disambiguation (storage/RAM variant collision fix)', () => {
  const ssd = (capacityGb: number) => ({
    GeneralInfo: { Brand: 'Samsung', ProductName: '990 PRO', GTIN: ['088806100000'] },
    FeaturesGroups: [
      {
        FeatureGroup: { Name: { Value: 'Storage' } },
        Features: [
          { Feature: { Name: { Value: 'SSD capacity' } }, RawValue: String(capacityGb) },
          { Feature: { Name: { Value: 'SSD form factor' } }, PresentationValue: 'M.2 2280' },
        ],
      },
    ],
  });

  it('gives same-named capacity variants distinct names + slugs', () => {
    const one = normalizeIcecatProduct(ssd(1000) as never, 'storage');
    const two = normalizeIcecatProduct(ssd(2000) as never, 'storage');
    expect(one!.name).toBe('Samsung 990 PRO 1 TB');
    expect(two!.name).toBe('Samsung 990 PRO 2 TB');
    expect(one!.slug).not.toBe(two!.slug); // no upsert collision
  });

  it("doesn't double-append when the name already states capacity", () => {
    const data = {
      GeneralInfo: { Brand: 'Kingston', ProductName: 'FURY Beast 32GB DDR5' },
      FeaturesGroups: [
        { FeatureGroup: { Name: { Value: 'Memory' } },
          Features: [{ Feature: { Name: { Value: 'Internal memory' } }, RawValue: '32' }] },
      ],
    };
    const part = normalizeIcecatProduct(data as never, 'ram');
    expect(part!.name).toBe('Kingston FURY Beast 32GB DDR5');
  });
});

describe('storage subtype inference (HDD vs SSD)', () => {
  it('infers HDD from a rotational speed feature', () => {
    const data = {
      GeneralInfo: { Brand: 'Seagate', ProductName: 'BarraCuda' },
      FeaturesGroups: [
        { FeatureGroup: { Name: { Value: 'Storage' } }, Features: [
          { Feature: { Name: { Value: 'HDD capacity' } }, RawValue: '2000' },
          { Feature: { Name: { Value: 'Hard drive size' } }, PresentationValue: '3.5"' },
          { Feature: { Name: { Value: 'Rotational speed' } }, RawValue: '7200' },
        ] },
      ],
    };
    const part = normalizeIcecatProduct(data as never, 'storage');
    expect(part!.specs.subtype).toBe('hdd');
  });

  it('infers SSD from an NVMe interface', () => {
    const data = {
      GeneralInfo: { Brand: 'Samsung', ProductName: '990 PRO' },
      FeaturesGroups: [
        { FeatureGroup: { Name: { Value: 'Storage' } }, Features: [
          { Feature: { Name: { Value: 'SSD capacity' } }, RawValue: '1000' },
          { Feature: { Name: { Value: 'Interface' } }, PresentationValue: 'PCIe 4.0 NVMe' },
        ] },
      ],
    };
    const part = normalizeIcecatProduct(data as never, 'storage');
    expect(part!.specs.subtype).toBe('ssd');
  });
});
