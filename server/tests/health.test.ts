import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { startMemoryDb, stopMemoryDb } from './helpers/memoryDb.js';
import { ComponentModel } from '../src/models/index.js';

describe('Phase 1 — data layer', () => {
  const app = createApp();

  beforeAll(async () => {
    await startMemoryDb();
  });
  afterAll(async () => {
    await stopMemoryDb();
  });

  it('GET /api/health reports ok + connected db', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
  });

  it('unknown routes return the typed error envelope', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'ROUTE_NOT_FOUND' });
  });

  it('Component model declares the spec §6 indexes', async () => {
    await ComponentModel.init();
    const indexes = await ComponentModel.collection.indexes();
    const keys = indexes.map((i) => JSON.stringify(i.key));
    expect(keys).toContain(JSON.stringify({ category: 1, slug: 1 }));
    expect(keys).toContain(JSON.stringify({ category: 1, performanceIndex: -1 }));
    // text index shows up as { _fts: 'text', _ftsx: 1 }
    expect(indexes.some((i) => i.key._fts === 'text')).toBe(true);
  });
});
