import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startMemoryDb, stopMemoryDb, clearCollections } from './helpers/memoryDb.js';
import { seedDatabase } from '../src/seed/seed.js';
import { ComponentModel } from '../src/models/index.js';
import { CATEGORIES } from '@automatorr/shared';

describe('Phase 2 — seeding pipeline', () => {
  beforeAll(async () => {
    await startMemoryDb();
    await clearCollections();
  });
  afterAll(async () => {
    await stopMemoryDb();
  });

  it('populates all four categories with complete docs', async () => {
    const summaries = await seedDatabase();
    expect(summaries).toHaveLength(4);

    for (const cat of CATEGORIES) {
      const docs = await ComponentModel.find({ category: cat });
      expect(docs.length).toBeGreaterThanOrEqual(6);
      for (const d of docs) {
        expect(d.performanceIndex).toBeGreaterThan(0);
        expect(d.benchmark.ubRaw).toBeGreaterThan(0);
        expect(d.provenance.specSourceUrl).toMatch(/^https?:\/\//);
        expect(d.slug).toBeTruthy();
      }
    }
  });

  it('sources CPU performance from PassMark, pinning i5-13600K to the reference index', async () => {
    const ref = await ComponentModel.findOne({ category: 'cpu', slug: 'intel-core-i5-13600k' });
    expect(ref?.benchmark.ubSource).toContain('passmark');
    expect(ref?.performanceIndex).toBe(1000); // i5-13600K pinned to REFERENCE_INDEX
    const top = await ComponentModel.findOne({ category: 'cpu', slug: 'intel-core-i9-14900k' });
    expect(top!.performanceIndex).toBeGreaterThan(ref!.performanceIndex);
  });

  it('keeps SSD performanceIndex well above HDD (cross-subtype, single scale)', async () => {
    const ssd = await ComponentModel.findOne({ category: 'storage', slug: 'wd-black-sn8100-4tb' });
    const hdd = await ComponentModel.findOne({ category: 'storage', slug: 'seagate-barracuda-2tb' });
    expect(ssd?.provenance.subtypeSource).toBe('ssd');
    expect(hdd?.provenance.subtypeSource).toBe('hdd');
    expect(ssd!.performanceIndex).toBeGreaterThan(hdd!.performanceIndex);
  });

  it('flags genuinely-unknown spec values rather than guessing', async () => {
    const sn8100 = await ComponentModel.findOne({ category: 'storage', slug: 'wd-black-sn8100-4tb' });
    expect(sn8100?.provenance.unknownFields).toContain('dram');
  });

  it('is idempotent — re-running does not duplicate', async () => {
    const before = await ComponentModel.countDocuments();
    await seedDatabase();
    const after = await ComponentModel.countDocuments();
    expect(after).toBe(before);
  });
});
