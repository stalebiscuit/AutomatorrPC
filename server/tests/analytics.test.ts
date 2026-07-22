import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { startMemoryDb, stopMemoryDb, clearCollections } from './helpers/memoryDb.js';
import { makePairKey } from '@automatorr/shared';
import { buildRollups } from '../src/services/analytics.js';
import { TrendRollupModel, AllowedDomainModel } from '../src/models/index.js';
import { installCapturingMailer, loginAs, lastOtpCode } from './helpers/auth.js';

describe('Phase 5 — analytics, events & admin', () => {
  const app = createApp();

  beforeAll(async () => {
    await startMemoryDb();
    await clearCollections();
    installCapturingMailer();
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

  it('rejects a wrong OTP code with 401', async () => {
    const agent = request.agent(app);
    await AllowedDomainModel.updateOne(
      { domain: 'example.com' },
      { $set: { domain: 'example.com' } },
      { upsert: true },
    );
    await agent.post('/api/admin/auth/request-otp').send({ email: 'someone@example.com' });
    const wrong = lastOtpCode() === '000000' ? '111111' : '000000';
    const res = await agent
      .post('/api/admin/auth/verify-otp')
      .send({ email: 'someone@example.com', code: wrong });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('BAD_CODE');
  });

  it('signs in via email OTP and returns aggregated analytics when authed', async () => {
    const { agent, verify } = await loginAs(app, 'admin@example.com');
    expect(verify.status).toBe(200);
    expect(verify.body.user.role).toBe('admin');

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
