import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { startMemoryDb, stopMemoryDb, clearCollections } from './helpers/memoryDb.js';
import { seedDatabase } from '../src/seed/seed.js';
import { PLACEHOLDER_PROSE } from '../src/services/verdict/PlaceholderVerdictProvider.js';

describe('Phase 3 — public API', () => {
  const app = createApp();

  beforeAll(async () => {
    await startMemoryDb();
    await clearCollections();
    await seedDatabase();
  });
  afterAll(async () => {
    await stopMemoryDb();
  });

  it('GET /api/categories returns the 4 categories', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body.categories.map((c: { id: string }) => c.id)).toEqual([
      'cpu',
      'gpu',
      'ram',
      'storage',
    ]);
  });

  it('GET /api/components?category=cpu lists components sorted by index desc', async () => {
    const res = await request(app).get('/api/components?category=cpu');
    expect(res.status).toBe(200);
    const idx = res.body.components.map((c: { performanceIndex: number }) => c.performanceIndex);
    expect(idx).toEqual([...idx].sort((x, y) => y - x));
  });

  it('GET /api/components?category=cpu&q=ryzen filters by substring', async () => {
    const res = await request(app).get('/api/components?category=cpu&q=ryzen');
    expect(res.status).toBe(200);
    expect(res.body.components.length).toBeGreaterThan(0);
    for (const c of res.body.components) expect(c.name.toLowerCase()).toContain('ryzen');
  });

  it('GET /api/components/:category/:slug returns a single component', async () => {
    const res = await request(app).get('/api/components/cpu/amd-ryzen-7-7800x3d');
    expect(res.status).toBe(200);
    expect(res.body.component.specs.l3Cache).toBe(96);
  });

  it('GET unknown component → 404 typed error', async () => {
    const res = await request(app).get('/api/components/cpu/nope');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('GET /api/compare returns specs + scorecard (Intel winner)', async () => {
    const res = await request(app).get(
      '/api/compare?category=cpu&a=intel-core-i9-14900k&b=amd-ryzen-7-7800x3d',
    );
    expect(res.status).toBe(200);
    expect(res.body.scorecard.winnerSlug).toBe('intel-core-i9-14900k');
    expect(res.body.rows.length).toBeGreaterThan(5);
    expect(res.body.scorecard.tags).toContain('Gaming');
  });

  it('GET /api/verdict returns the placeholder prose, generated:false', async () => {
    const res = await request(app).get(
      '/api/verdict?category=cpu&a=intel-core-i9-14900k&b=amd-ryzen-7-7800x3d',
    );
    expect(res.status).toBe(200);
    expect(res.body.generated).toBe(false);
    expect(res.body.prose).toBe(PLACEHOLDER_PROSE);
    expect(res.body.scorecard.winnerSlug).toBe('intel-core-i9-14900k');
  });

  it('rejects invalid category with a 400 validation error', async () => {
    const res = await request(app).get('/api/components?category=motherboard');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects comparing a component with itself', async () => {
    const res = await request(app).get(
      '/api/compare?category=cpu&a=amd-ryzen-7-7800x3d&b=amd-ryzen-7-7800x3d',
    );
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SAME_COMPONENT');
  });
});
