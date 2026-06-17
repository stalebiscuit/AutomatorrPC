import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { startMemoryDb, stopMemoryDb, clearCollections } from './helpers/memoryDb.js';
import { makePairKey } from '@automatorr/shared';
import { buildRollups } from '../src/services/analytics.js';
import { TrendRollupModel } from '../src/models/index.js';

describe('Phase 5 — analytics, events & admin', () => {
  const app = createApp();

  beforeAll(async () => {
    await startMemoryDb();
    await clearCollections();
  });
  afterAll(async () => {
    await stopMemoryDb();
  });

  it('POST /api/events/search records a search event', async () => {
    const res = await request(app)
      .post('/api/events/search')
      .send({ category: 'cpu', query: 'ryzen', componentId: 'aaaaaaaaaaaaaaaaaaaaaaaa', sessionId: 's1' });
    expect(res.status).toBe(201);
  });

  it('POST /api/events/click records a click event', async () => {
    const res = await request(app).post('/api/events/click').send({
      componentId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      store: 'Scorptec',
      url: 'https://www.scorptec.com.au/product/x',
      sessionId: 's1',
    });
    expect(res.status).toBe(201);
  });

  it('records a comparison view with a pairKey', async () => {
    const pairKey = makePairKey('cpu', 'amd-ryzen-7-7800x3d', 'intel-core-i9-14900k');
    const res = await request(app)
      .post('/api/events/search')
      .send({ type: 'view', category: 'cpu', pairKey, sessionId: 's1' });
    expect(res.status).toBe(201);
  });

  it('validates event bodies (400 on missing sessionId)', async () => {
    const res = await request(app).post('/api/events/click').send({ store: 'X', url: 'https://x.com' });
    expect(res.status).toBe(400);
  });

  it('blocks /api/admin/analytics without a session', async () => {
    const res = await request(app).get('/api/admin/analytics');
    expect(res.status).toBe(401);
  });

  it('rejects bad admin credentials', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ username: 'admin', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('BAD_CREDENTIALS');
  });

  it('logs in with env creds and returns aggregated analytics when authed', async () => {
    const agent = request.agent(app);
    const login = await agent
      .post('/api/admin/login')
      .send({ username: 'admin', password: 'test-password' });
    expect(login.status).toBe(200);

    const res = await agent.get('/api/admin/analytics?window=week');
    expect(res.status).toBe(200);
    expect(res.body.totals.searches).toBeGreaterThanOrEqual(1);
    expect(res.body.totals.clicks).toBeGreaterThanOrEqual(1);
    expect(res.body.topStores.map((s: { label: string }) => s.label)).toContain('Scorptec');
    expect(res.body.topComparisons.length).toBeGreaterThanOrEqual(1);
    expect(res.body.recentEvents.length).toBeGreaterThan(0);
  });

  it('buildRollups persists rollup snapshots', async () => {
    await buildRollups();
    const count = await TrendRollupModel.countDocuments({ window: 'day' });
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
