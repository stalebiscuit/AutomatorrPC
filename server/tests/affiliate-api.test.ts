import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { startMemoryDb, stopMemoryDb, clearCollections } from './helpers/memoryDb.js';
import { seedDatabase } from '../src/seed/seed.js';
import { ComponentModel } from '../src/models/index.js';
import { loadAffiliateConfigs, resetAffiliateCacheForTests } from '../src/services/affiliate/affiliateService.js';
import { installCapturingMailer, loginAs } from './helpers/auth.js';

describe('Affiliate config API + read decoration', () => {
  const app = createApp();

  beforeAll(async () => {
    await startMemoryDb();
    await clearCollections();
    resetAffiliateCacheForTests();
    installCapturingMailer();
    await seedDatabase();
    // Give a known CPU a Scorptec price so we can assert decoration end-to-end.
    await ComponentModel.updateOne(
      { category: 'cpu', slug: 'intel-core-i9-14900k' },
      {
        $set: {
          prices: [
            {
              store: 'Scorptec',
              price: 999,
              currency: 'AUD',
              url: 'https://www.scorptec.com.au/product/x',
              lastUpdated: new Date(),
            },
          ],
        },
      },
    );
    await loadAffiliateConfigs();
  });
  afterAll(async () => {
    await stopMemoryDb();
  });

  const login = async () => {
    const { agent } = await loginAs(app, 'admin@example.com');
    return agent;
  };

  it('blocks GET /api/admin/affiliates without a session', async () => {
    const res = await request(app).get('/api/admin/affiliates');
    expect(res.status).toBe(401);
  });

  it('lists all nine known stores with pass-through defaults', async () => {
    const agent = await login();
    const res = await agent.get('/api/admin/affiliates');
    expect(res.status).toBe(200);
    const stores = res.body.stores as { store: string; mode: string }[];
    expect(stores.map((s) => s.store)).toEqual([
      'Amazon',
      'Mwave',
      'Scorptec',
      'PLE Computers',
      'PCCaseGear',
      'Centre Com',
      'Umart',
      'MSY',
      'JB Hi-Fi',
    ]);
    expect(stores.every((s) => s.mode === 'off')).toBe(true);
  });

  it('rejects an unknown store with 404', async () => {
    const agent = await login();
    const res = await agent
      .put('/api/admin/affiliates/Nope')
      .set('x-csrf', '1')
      .send({ mode: 'tag', tag: 'x' });
    expect(res.status).toBe(404);
  });

  it('rejects an invalid mode with 400', async () => {
    const agent = await login();
    const res = await agent
      .put('/api/admin/affiliates/Amazon')
      .set('x-csrf', '1')
      .send({ mode: 'bogus' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a wrapper template missing {url} with 400', async () => {
    const agent = await login();
    const res = await agent
      .put('/api/admin/affiliates/Mwave')
      .set('x-csrf', '1')
      .send({ mode: 'wrapper', wrapperTemplate: 'https://t.cfjump.com/1/t' });
    expect(res.status).toBe(400);
  });

  it('saves a tag config and decorates that store\'s URLs on read', async () => {
    const agent = await login();
    const put = await agent
      .put('/api/admin/affiliates/Scorptec')
      .set('x-csrf', '1')
      .send({ mode: 'tag', paramName: 'aff', tag: 'automatorr-22' });
    expect(put.status).toBe(200);
    expect(put.body.store.mode).toBe('tag');

    const res = await request(app).get('/api/components/cpu/intel-core-i9-14900k');
    expect(res.status).toBe(200);
    const price = res.body.component.prices.find((p: { store: string }) => p.store === 'Scorptec');
    expect(price.url).toBe('https://www.scorptec.com.au/product/x?aff=automatorr-22');
  });
});
