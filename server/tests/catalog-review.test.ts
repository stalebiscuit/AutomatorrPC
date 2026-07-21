import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startMemoryDb, stopMemoryDb, clearCollections } from './helpers/memoryDb.js';
import { ComponentModel, MatchReviewModel, MatchAliasModel } from '../src/models/index.js';
import {
  resolveListing,
  confirmReview,
  rejectReview,
  listPendingReviews,
} from '../src/services/catalog/matchStore.js';

async function seedCandidate(): Promise<void> {
  await ComponentModel.create({
    category: 'cpu',
    brand: 'AMD',
    name: 'AMD Ryzen 5 7600X',
    slug: 'amd-ryzen-5-7600x',
    specs: { socket: 'AM5' },
    benchmark: { ubRaw: 0, ubSource: 'test' },
    performanceIndex: 0,
    prices: [],
    provenance: { specSourceUrl: 'test://', seededAt: new Date(), unknownFields: [] },
  });
}

describe('Task 3 — matcher persistence (review queue + alias table)', () => {
  beforeAll(async () => {
    await startMemoryDb();
  });
  afterAll(async () => {
    await stopMemoryDb();
  });
  beforeEach(async () => {
    await clearCollections();
    await seedCandidate();
  });

  it('resolves a noisy listing to the catalogue part (no review queued)', async () => {
    const r = await resolveListing({
      category: 'cpu',
      brand: 'AMD',
      name: 'AMD Ryzen 5 7600X 6-Core AM5 Processor',
      store: 'Mwave',
    });
    expect(r.slug).toBe('amd-ryzen-5-7600x');
    expect(await MatchReviewModel.countDocuments()).toBe(0);
  });

  it('queues an unresolved listing for review', async () => {
    const r = await resolveListing({
      category: 'cpu',
      brand: 'AMD',
      name: 'AMD Ryzen 9 9950X3D',
      store: 'Scorptec',
      price: 999,
      url: 'https://example/x',
    });
    expect(r.slug).toBeNull();
    const pending = await listPendingReviews();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.store).toBe('Scorptec');
  });

  it('confirming a review writes an alias so it auto-resolves next time', async () => {
    const listing = { category: 'cpu', brand: 'AMD', name: 'Mystery 7600X SKU', store: 'PLE' };
    await resolveListing(listing);
    const pending = await listPendingReviews();
    expect(pending).toHaveLength(1);

    const ok = await confirmReview(String(pending[0]!._id), 'amd-ryzen-5-7600x');
    expect(ok).toBe(true);
    expect(await MatchAliasModel.countDocuments()).toBe(1);

    const again = await resolveListing(listing);
    expect(again).toMatchObject({ slug: 'amd-ryzen-5-7600x', method: 'alias' });
    // no duplicate review created
    expect(await MatchReviewModel.countDocuments({ status: 'pending' })).toBe(0);
  });

  it('rejecting a review marks it rejected', async () => {
    await resolveListing({ category: 'cpu', brand: 'AMD', name: 'Totally Unknown Part', store: 'PCCaseGear' });
    const pending = await listPendingReviews();
    const ok = await rejectReview(String(pending[0]!._id));
    expect(ok).toBe(true);
    expect(await listPendingReviews()).toHaveLength(0);
  });
});
