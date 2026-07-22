import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { startMemoryDb, stopMemoryDb, clearCollections } from './helpers/memoryDb.js';
import { FeedbackModel } from '../src/models/index.js';
import { installCapturingMailer, loginAs } from './helpers/auth.js';

describe('Launch-polish P4 — feedback intake & admin triage', () => {
  const app = createApp();

  beforeAll(async () => {
    await startMemoryDb();
    await clearCollections();
    installCapturingMailer();
  });
  afterAll(async () => {
    await stopMemoryDb();
  });

  const valid = {
    type: 'data',
    message: 'The RAM speed listed for the Fury Beast kit is wrong.',
    context: { path: '/compare/ram/a-vs-b', category: 'ram', slugs: ['a', 'b'] },
    sessionId: 's1',
  };

  it('POST /api/feedback stores a submission with context', async () => {
    const res = await request(app).post('/api/feedback').send(valid);
    expect(res.status).toBe(201);
    const doc = await FeedbackModel.findOne({ sessionId: 's1' }).lean();
    expect(doc).toBeTruthy();
    expect(doc!.status).toBe('new');
    expect(doc!.context!.category).toBe('ram');
    expect(doc!.context!.slugs).toEqual(['a', 'b']);
  });

  it('rejects too-short messages (400)', async () => {
    const res = await request(app).post('/api/feedback').send({ ...valid, message: 'bad' });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown type (400)', async () => {
    const res = await request(app).post('/api/feedback').send({ ...valid, type: 'rant' });
    expect(res.status).toBe(400);
  });

  it('rejects messages over 200 words (400)', async () => {
    const longMessage = Array.from({ length: 201 }, (_, i) => `word${i}`).join(' ');
    const res = await request(app).post('/api/feedback').send({ ...valid, message: longMessage });
    expect(res.status).toBe(400);
  });

  it('silently drops honeypot submissions (201, nothing stored)', async () => {
    const before = await FeedbackModel.countDocuments();
    const res = await request(app)
      .post('/api/feedback')
      .send({ ...valid, website: 'https://spam.example' });
    expect(res.status).toBe(201);
    expect(await FeedbackModel.countDocuments()).toBe(before);
  });

  it('rate-limits after 5 submissions in the window (429)', async () => {
    // 2 already sent above (honeypot counts against the limit too).
    for (let i = 0; i < 3; i += 1) {
      const res = await request(app)
        .post('/api/feedback')
        .send({ ...valid, message: `Legitimate feedback number ${i} with enough length.` });
      expect(res.status).toBe(201);
    }
    const res = await request(app).post('/api/feedback').send(valid);
    expect(res.status).toBe(429);
  });

  it('GET /api/admin/feedback requires auth (401)', async () => {
    const res = await request(app).get('/api/admin/feedback');
    expect(res.status).toBe(401);
  });

  it('admin can list and triage feedback', async () => {
    const { agent } = await loginAs(app, 'daniel.hardman@automatorr.com');

    const list = await agent.get('/api/admin/feedback');
    expect(list.status).toBe(200);
    expect(list.body.counts.new).toBeGreaterThan(0);
    const first = list.body.feedback[0];
    expect(first.status).toBe('new');

    const patch = await agent
      .patch(`/api/admin/feedback/${first.id}`)
      .set('x-csrf', '1')
      .send({ status: 'reviewed', adminNote: 'checking with the RAM decoder' });
    expect(patch.status).toBe(200);
    expect(patch.body.feedback.status).toBe('reviewed');
    expect(patch.body.feedback.adminNote).toContain('decoder');
  });

  it('PATCH without csrf header is rejected', async () => {
    const { agent } = await loginAs(app, 'daniel.hardman@automatorr.com');
    const list = await agent.get('/api/admin/feedback');
    const first = list.body.feedback[0];
    const res = await agent
      .patch(`/api/admin/feedback/${first.id}`)
      .set('x-csrf', '')
      .send({ status: 'done' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
