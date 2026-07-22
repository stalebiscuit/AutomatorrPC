import { loadConfig } from '../../config.js';
import { AdminOtpModel } from '../../models/index.js';
import { getMailer } from './mailer.js';
import { renderOtpEmail } from './emailTemplates.js';
import { sha256Hex, randomHex, randomNumericCode, safeEqualHex } from './hashing.js';
import { normalizeEmail } from './util.js';

const hashCode = (salt: string, code: string): string => sha256Hex(`${salt}:${code}`);
const createdMs = (doc: { createdAt?: Date }): number => doc.createdAt?.getTime() ?? 0;

export interface IssueResult {
  sent: boolean;
  /** Silently throttled (resend too soon, or hourly cap hit). */
  throttled: boolean;
}

/**
 * Generate a fresh code, store only its salted hash, invalidate any prior live
 * codes for this email, and email it. Enforces a resend interval and hourly cap
 * silently (returns throttled:false-sent so the caller can respond generically).
 * The caller is responsible for eligibility — this only manages the OTP lifecycle.
 */
export async function issueOtp(email: string, ip = ''): Promise<IssueResult> {
  const cfg = loadConfig();
  const normEmail = normalizeEmail(email);
  const now = Date.now();

  const recentCount = await AdminOtpModel.countDocuments({
    email: normEmail,
    createdAt: { $gte: new Date(now - 3_600_000) },
  });
  if (recentCount >= cfg.OTP_MAX_PER_HOUR) return { sent: false, throttled: true };

  const latest = await AdminOtpModel.findOne({ email: normEmail }).sort({ createdAt: -1 });
  if (latest && !latest.consumedAt) {
    const sinceMs = now - createdMs(latest as unknown as { createdAt?: Date });
    if (sinceMs < cfg.OTP_RESEND_INTERVAL_SEC * 1000) return { sent: false, throttled: true };
  }

  const code = randomNumericCode(6);
  const salt = randomHex(16);

  // Only the newest code is ever valid.
  await AdminOtpModel.updateMany(
    { email: normEmail, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );
  await AdminOtpModel.create({
    email: normEmail,
    codeHash: hashCode(salt, code),
    salt,
    expiresAt: new Date(now + cfg.OTP_TTL_MIN * 60_000),
    attempts: 0,
    maxAttempts: cfg.OTP_MAX_ATTEMPTS,
    requestIp: ip,
  });

  const mail = renderOtpEmail(code, cfg.OTP_TTL_MIN);
  await getMailer().send({ to: normEmail, subject: mail.subject, text: mail.text, html: mail.html });
  return { sent: true, throttled: false };
}

export type VerifyResult = { ok: true } | { ok: false; reason: 'invalid' | 'expired' | 'locked' };

/**
 * Verify a submitted code against the newest live OTP for the email. Wrong
 * guesses increment attempts and burn the code once the cap is reached.
 */
export async function verifyOtp(email: string, code: string): Promise<VerifyResult> {
  const normEmail = normalizeEmail(email);
  const otp = await AdminOtpModel.findOne({ email: normEmail, consumedAt: null }).sort({
    createdAt: -1,
  });
  if (!otp) return { ok: false, reason: 'invalid' };

  if (new Date(otp.expiresAt).getTime() < Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  if (otp.attempts >= otp.maxAttempts) {
    otp.consumedAt = new Date();
    await otp.save();
    return { ok: false, reason: 'locked' };
  }

  const matches = safeEqualHex(hashCode(otp.salt, code), otp.codeHash);
  if (!matches) {
    otp.attempts += 1;
    if (otp.attempts >= otp.maxAttempts) otp.consumedAt = new Date();
    await otp.save();
    return { ok: false, reason: 'invalid' };
  }

  otp.consumedAt = new Date();
  await otp.save();
  return { ok: true };
}
