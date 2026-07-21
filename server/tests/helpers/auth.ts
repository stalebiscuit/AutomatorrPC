import request from 'supertest';
import type { Express } from 'express';
import { setMailerForTests, type Mailer } from '../../src/services/auth/mailer.js';
import { AdminUserModel, AllowedDomainModel } from '../../src/models/index.js';
import { normalizeEmail } from '../../src/services/auth/util.js';

let lastCode: string | null = null;

/** Install a mailer that captures the OTP code from the outgoing email body. */
export function installCapturingMailer(): void {
  const capturing: Mailer = {
    async send(input) {
      const m = input.text.match(/\b(\d{6})\b/);
      lastCode = m?.[1] ?? null;
    },
  };
  setMailerForTests(capturing);
}

export function lastOtpCode(): string | null {
  return lastCode;
}

type Agent = ReturnType<typeof request.agent>;

/** Seed eligibility (a domain, or a superadmin) then drive the real OTP flow. */
export async function loginAs(
  app: Express,
  email: string,
  opts: { superadmin?: boolean } = {},
): Promise<{ agent: Agent; verify: request.Response }> {
  const norm = normalizeEmail(email);
  if (opts.superadmin) {
    await AdminUserModel.updateOne(
      { email: norm },
      { $set: { role: 'superadmin', status: 'active', source: 'seed' } },
      { upsert: true },
    );
  } else {
    const domain = norm.split('@')[1];
    await AllowedDomainModel.updateOne({ domain }, { $set: { domain } }, { upsert: true });
  }
  const agent = request.agent(app);
  await agent.post('/api/admin/auth/request-otp').send({ email });
  const verify = await agent
    .post('/api/admin/auth/verify-otp')
    .send({ email, code: lastCode });
  return { agent, verify };
}
