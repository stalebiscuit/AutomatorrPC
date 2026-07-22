import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { startMemoryDb, stopMemoryDb, clearCollections } from './helpers/memoryDb.js';
import { installCapturingMailer, loginAs, lastOtpCode } from './helpers/auth.js';
import {
  AdminOtpModel,
  AdminSessionModel,
  AllowedDomainModel,
} from '../src/models/index.js';
import { seedSuperadmins } from '../src/services/auth/bootstrap.js';

const FOUNDER = 'daniel.hardman@automatorr.com';

/** Extract a cookie value from a Set-Cookie header (array or string). */
function cookieValue(setCookie: string[] | string | undefined, name: string): string | undefined {
  if (!setCookie) return undefined;
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of arr) {
    const m = c.match(new RegExp(`^${name}=([^;]+)`));
    if (m) return m[1];
  }
  return undefined;
}

describe('Admin auth — OTP + RS256 + RBAC', () => {
  const app = createApp();

  beforeAll(async () => {
    await startMemoryDb();
    installCapturingMailer();
  });
  afterAll(async () => {
    await stopMemoryDb();
  });
  beforeEach(async () => {
    await clearCollections();
  });

  describe('eligibility + OTP', () => {
    it('request-otp returns a generic 200 and issues no code for an ineligible email', async () => {
      const res = await request(app)
        .post('/api/admin/auth/request-otp')
        .send({ email: 'stranger@nowhere.example' });
      expect(res.status).toBe(200);
      expect(await AdminOtpModel.countDocuments()).toBe(0);
    });

    it('issues a code for an allow-listed domain', async () => {
      await AllowedDomainModel.create({ domain: 'automatorr.com' });
      const res = await request(app)
        .post('/api/admin/auth/request-otp')
        .send({ email: 'someone@automatorr.com' });
      expect(res.status).toBe(200);
      expect(lastOtpCode()).toMatch(/^\d{6}$/);
    });

    it('burns the code after 5 wrong attempts', async () => {
      await AllowedDomainModel.create({ domain: 'automatorr.com' });
      await request(app).post('/api/admin/auth/request-otp').send({ email: 'x@automatorr.com' });
      const real = lastOtpCode();
      const wrong = real === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/admin/auth/verify-otp')
          .send({ email: 'x@automatorr.com', code: wrong });
      }
      const res = await request(app)
        .post('/api/admin/auth/verify-otp')
        .send({ email: 'x@automatorr.com', code: real });
      expect(res.status).toBe(401);
    });
  });

  describe('sessions', () => {
    it('verify-otp sets cookies and returns the user', async () => {
      const { verify } = await loginAs(app, 'admin@automatorr.com');
      expect(verify.status).toBe(200);
      expect(verify.body.user).toEqual({ email: 'admin@automatorr.com', role: 'admin' });
      const sc = verify.headers['set-cookie'];
      expect(cookieValue(sc, 'sp_at')).toBeTruthy();
      expect(cookieValue(sc, 'sp_rt')).toBeTruthy();
    });

    it('protects /auth/me (401 without session, 200 with)', async () => {
      const noauth = await request(app).get('/api/admin/auth/me');
      expect(noauth.status).toBe(401);
      const { agent } = await loginAs(app, 'admin@automatorr.com');
      const me = await agent.get('/api/admin/auth/me');
      expect(me.status).toBe(200);
      expect(me.body.authenticated).toBe(true);
    });

    it('rotates refresh tokens and revokes the family on reuse', async () => {
      await AllowedDomainModel.create({ domain: 'automatorr.com' });
      await request(app).post('/api/admin/auth/request-otp').send({ email: 'u@automatorr.com' });
      const verify = await request(app)
        .post('/api/admin/auth/verify-otp')
        .send({ email: 'u@automatorr.com', code: lastOtpCode() });
      const rt1 = cookieValue(verify.headers['set-cookie'], 'sp_rt') as string;

      const r1 = await request(app)
        .post('/api/admin/auth/refresh')
        .set('x-csrf', '1')
        .set('Cookie', `sp_rt=${rt1}`);
      expect(r1.status).toBe(200);
      const rt2 = cookieValue(r1.headers['set-cookie'], 'sp_rt') as string;
      expect(rt2).toBeTruthy();
      expect(rt2).not.toBe(rt1);

      // Replaying the old token is treated as theft → whole family revoked.
      const reuse = await request(app)
        .post('/api/admin/auth/refresh')
        .set('x-csrf', '1')
        .set('Cookie', `sp_rt=${rt1}`);
      expect(reuse.status).toBe(401);

      const afterReuse = await request(app)
        .post('/api/admin/auth/refresh')
        .set('x-csrf', '1')
        .set('Cookie', `sp_rt=${rt2}`);
      expect(afterReuse.status).toBe(401);
    });

    it('requires the CSRF header on refresh', async () => {
      const { agent } = await loginAs(app, 'admin@automatorr.com');
      const res = await agent.post('/api/admin/auth/refresh');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CSRF_REQUIRED');
    });

    it('rejects refresh past the absolute session cap', async () => {
      await AllowedDomainModel.create({ domain: 'automatorr.com' });
      await request(app).post('/api/admin/auth/request-otp').send({ email: 'cap@automatorr.com' });
      const verify = await request(app)
        .post('/api/admin/auth/verify-otp')
        .send({ email: 'cap@automatorr.com', code: lastOtpCode() });
      const rt = cookieValue(verify.headers['set-cookie'], 'sp_rt') as string;
      await AdminSessionModel.updateMany(
        {},
        { $set: { absoluteExpiresAt: new Date(Date.now() - 1000), expiresAt: new Date(Date.now() - 1000) } },
      );
      const res = await request(app)
        .post('/api/admin/auth/refresh')
        .set('x-csrf', '1')
        .set('Cookie', `sp_rt=${rt}`);
      expect(res.status).toBe(401);
    });

    it('logout revokes the session', async () => {
      const { agent } = await loginAs(app, 'admin@automatorr.com');
      const out = await agent.post('/api/admin/auth/logout');
      expect(out.status).toBe(200);
      expect(await AdminSessionModel.countDocuments({ revokedAt: null })).toBe(0);
    });
  });

  describe('RBAC + management', () => {
    it('blocks a plain admin from the Users API but allows a super-admin', async () => {
      const admin = await loginAs(app, 'admin@automatorr.com');
      expect((await admin.agent.get('/api/admin/users')).status).toBe(403);

      const su = await loginAs(app, FOUNDER, { superadmin: true });
      expect((await su.agent.get('/api/admin/users')).status).toBe(200);
    });

    it('super-admin can CRUD allowed domains', async () => {
      const { agent } = await loginAs(app, FOUNDER, { superadmin: true });
      const create = await agent
        .post('/api/admin/allowed-domains')
        .set('x-csrf', '1')
        .send({ domain: 'example.org' });
      expect(create.status).toBe(201);
      const id = create.body.domain.id;

      const list = await agent.get('/api/admin/allowed-domains');
      expect(list.body.domains.some((d: { domain: string }) => d.domain === 'example.org')).toBe(true);

      const patch = await agent
        .patch(`/api/admin/allowed-domains/${id}`)
        .set('x-csrf', '1')
        .send({ domain: 'example.net' });
      expect(patch.status).toBe(200);
      expect(patch.body.domain.domain).toBe('example.net');

      const del = await agent.delete(`/api/admin/allowed-domains/${id}`).set('x-csrf', '1');
      expect(del.status).toBe(200);
    });

    it('requires the CSRF header on management mutations', async () => {
      const { agent } = await loginAs(app, FOUNDER, { superadmin: true });
      const res = await agent.post('/api/admin/allowed-domains').send({ domain: 'nocsrf.com' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CSRF_REQUIRED');
    });

    it('invited users are always admin; disabling revokes their sessions and access', async () => {
      const { agent } = await loginAs(app, FOUNDER, { superadmin: true });
      const create = await agent
        .post('/api/admin/users')
        .set('x-csrf', '1')
        .send({ email: 'invitee@partner.example' });
      expect(create.status).toBe(201);
      expect(create.body.user.role).toBe('admin');
      expect(create.body.user.source).toBe('invited');
      const id = create.body.user.id;

      const invitee = await loginAs(app, 'invitee@partner.example');
      expect(invitee.verify.status).toBe(200);

      const patch = await agent
        .patch(`/api/admin/users/${id}`)
        .set('x-csrf', '1')
        .send({ status: 'disabled' });
      expect(patch.status).toBe(200);
      expect(await AdminSessionModel.countDocuments({ userId: id, revokedAt: null })).toBe(0);

      // Disabled → no longer eligible, so a fresh login attempt fails.
      await request(app)
        .post('/api/admin/auth/request-otp')
        .send({ email: 'invitee@partner.example' });
      const relog = await request(app)
        .post('/api/admin/auth/verify-otp')
        .send({ email: 'invitee@partner.example', code: '123456' });
      expect(relog.status).toBe(401);
    });

    it('rejects setting role=superadmin via create (lock) and protects founders', async () => {
      await seedSuperadmins();
      const { agent } = await loginAs(app, FOUNDER, { superadmin: true });

      // The API has no role field; an attempt to smuggle one is ignored → admin.
      const create = await agent
        .post('/api/admin/users')
        .set('x-csrf', '1')
        .send({ email: 'sneaky@partner.example', role: 'superadmin' });
      expect(create.status).toBe(201);
      expect(create.body.user.role).toBe('admin');

      // Founders cannot be disabled or deleted.
      const list = await agent.get('/api/admin/users');
      const founder = list.body.users.find((u: { role: string }) => u.role === 'superadmin');
      expect(founder).toBeTruthy();
      const disable = await agent
        .patch(`/api/admin/users/${founder.id}`)
        .set('x-csrf', '1')
        .send({ status: 'disabled' });
      expect(disable.status).toBe(403);
      const del = await agent.delete(`/api/admin/users/${founder.id}`).set('x-csrf', '1');
      expect(del.status).toBe(403);
    });
  });
});
