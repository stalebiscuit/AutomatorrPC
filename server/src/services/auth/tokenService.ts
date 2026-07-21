import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { loadConfig } from '../../config.js';
import { logger } from '../../lib/logger.js';
import { AdminSessionModel, AdminUserModel, type AdminRole } from '../../models/index.js';
import { randomToken, sha256Hex } from './hashing.js';

// ── RS256 keypair ────────────────────────────────────────────────────
let keys: { privateKey: string; publicKey: string } | null = null;

/** Accept either raw PEM or base64-encoded PEM (env-friendly). */
function decodeKey(value: string): string {
  const s = value.trim();
  return s.includes('-----BEGIN') ? s : Buffer.from(s, 'base64').toString('utf8');
}

function getKeys(): { privateKey: string; publicKey: string } {
  if (keys) return keys;
  const cfg = loadConfig();
  if (cfg.ADMIN_JWT_PRIVATE_KEY && cfg.ADMIN_JWT_PUBLIC_KEY) {
    keys = {
      privateKey: decodeKey(cfg.ADMIN_JWT_PRIVATE_KEY),
      publicKey: decodeKey(cfg.ADMIN_JWT_PUBLIC_KEY),
    };
    return keys;
  }
  if (cfg.NODE_ENV === 'production') {
    throw new Error('ADMIN_JWT_PRIVATE_KEY/ADMIN_JWT_PUBLIC_KEY are required in production');
  }
  const gen = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  logger.warn('[auth] Using an ephemeral RS256 keypair (no ADMIN_JWT_* set) — dev/test only.');
  keys = { privateKey: gen.privateKey, publicKey: gen.publicKey };
  return keys;
}

/** Test seam — drop the cached keypair. */
export function resetAuthKeysForTests(): void {
  keys = null;
}

// ── Access token (stateless RS256 JWT) ───────────────────────────────
export interface AccessClaims {
  sub: string; // adminuser id
  email: string;
  role: AdminRole;
  sid: string; // session family id
}

export function issueAccessToken(claims: AccessClaims): string {
  const cfg = loadConfig();
  return jwt.sign(
    { email: claims.email, role: claims.role, sid: claims.sid },
    getKeys().privateKey,
    { algorithm: 'RS256', subject: claims.sub, expiresIn: cfg.ACCESS_TTL_MIN * 60 },
  );
}

/** Verify + decode an access token. Throws on any invalidity (alg pinned to RS256). */
export function verifyAccessToken(token: string): AccessClaims {
  const decoded = jwt.verify(token, getKeys().publicKey, { algorithms: ['RS256'] });
  if (typeof decoded === 'string' || !decoded.sub) throw new Error('Invalid token');
  const role = decoded.role as AdminRole;
  if (role !== 'admin' && role !== 'superadmin') throw new Error('Invalid role claim');
  return { sub: String(decoded.sub), email: String(decoded.email), role, sid: String(decoded.sid) };
}

// ── Refresh-token families (stateful, rotating) ──────────────────────
export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  sid: string;
  absoluteExpiresAt: Date;
}

export interface SessionUser {
  userId: string;
  email: string;
  role: AdminRole;
}

/** Open a new session family for a freshly-authenticated user. */
export async function createSession(
  user: SessionUser,
  ctx: { ip?: string; userAgent?: string } = {},
): Promise<IssuedTokens> {
  const cfg = loadConfig();
  const now = Date.now();
  const absoluteExpiresAt = new Date(now + cfg.SESSION_MAX_HOURS * 3_600_000);
  const familyId = randomToken(16);
  const refreshToken = randomToken(32);

  await AdminSessionModel.create({
    userId: user.userId,
    email: user.email,
    familyId,
    tokenHash: sha256Hex(refreshToken),
    issuedAt: new Date(now),
    expiresAt: absoluteExpiresAt,
    absoluteExpiresAt,
    ip: ctx.ip ?? '',
    userAgent: ctx.userAgent ?? '',
  });

  const accessToken = issueAccessToken({
    sub: user.userId,
    email: user.email,
    role: user.role,
    sid: familyId,
  });
  return { accessToken, refreshToken, sid: familyId, absoluteExpiresAt };
}

export type RotateResult =
  | { ok: true; tokens: IssuedTokens; user: SessionUser }
  | { ok: false; reason: 'invalid' | 'expired' | 'reuse' };

/**
 * Rotate a refresh token: validate, atomically consume it, and mint a new
 * access + refresh pair in the same family. Detects reuse of an already-rotated
 * token and revokes the whole family. Re-checks the user is still active.
 */
export async function rotateSession(
  refreshToken: string,
  ctx: { ip?: string; userAgent?: string } = {},
): Promise<RotateResult> {
  const tokenHash = sha256Hex(refreshToken);
  const existing = await AdminSessionModel.findOne({ tokenHash });
  if (!existing || existing.revokedAt) return { ok: false, reason: 'invalid' };

  const now = Date.now();
  if (
    new Date(existing.absoluteExpiresAt).getTime() < now ||
    new Date(existing.expiresAt).getTime() < now
  ) {
    return { ok: false, reason: 'expired' };
  }

  // Atomically claim this token. If it was already rotated, this is a replay.
  const claimed = await AdminSessionModel.findOneAndUpdate(
    { tokenHash, rotatedAt: null, revokedAt: null },
    { $set: { rotatedAt: new Date() } },
  );
  if (!claimed) {
    await revokeFamily(existing.familyId, 'refresh_reuse');
    return { ok: false, reason: 'reuse' };
  }

  // Re-check the user (role may have changed; account may be disabled).
  const dbUser = await AdminUserModel.findById(existing.userId);
  if (!dbUser || dbUser.status !== 'active') {
    await revokeFamily(existing.familyId, 'user_inactive');
    return { ok: false, reason: 'invalid' };
  }

  const newRefresh = randomToken(32);
  await AdminSessionModel.create({
    userId: existing.userId,
    email: existing.email,
    familyId: existing.familyId,
    tokenHash: sha256Hex(newRefresh),
    issuedAt: new Date(now),
    expiresAt: existing.absoluteExpiresAt,
    absoluteExpiresAt: existing.absoluteExpiresAt,
    rotatedFromId: claimed._id,
    ip: ctx.ip ?? '',
    userAgent: ctx.userAgent ?? '',
  });

  const user: SessionUser = {
    userId: String(existing.userId),
    email: dbUser.email,
    role: dbUser.role as AdminRole,
  };
  const accessToken = issueAccessToken({
    sub: user.userId,
    email: user.email,
    role: user.role,
    sid: existing.familyId,
  });
  return {
    ok: true,
    user,
    tokens: {
      accessToken,
      refreshToken: newRefresh,
      sid: existing.familyId,
      absoluteExpiresAt: new Date(existing.absoluteExpiresAt),
    },
  };
}

/** Revoke every (unrevoked) token in a family. Used for logout + reuse response. */
export async function revokeFamily(familyId: string, reason: string): Promise<void> {
  await AdminSessionModel.updateMany(
    { familyId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
}

/** Revoke a family via one of its refresh tokens (logout). Returns actor info. */
export async function revokeByRefreshToken(
  refreshToken: string,
  reason: string,
): Promise<{ familyId: string; email: string; userId: string } | null> {
  const s = await AdminSessionModel.findOne({ tokenHash: sha256Hex(refreshToken) });
  if (!s) return null;
  await revokeFamily(s.familyId, reason);
  return { familyId: s.familyId, email: s.email, userId: String(s.userId) };
}

/** Revoke every active session for a user (on disable/delete). */
export async function revokeAllForUser(userId: string, reason: string): Promise<void> {
  await AdminSessionModel.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
}

/** Cookie lifetimes (ms) derived from config, for the route layer. */
export function cookieMaxAges(): { accessMs: number; refreshMs: number } {
  const cfg = loadConfig();
  return {
    accessMs: cfg.ACCESS_TTL_MIN * 60_000,
    refreshMs: cfg.SESSION_MAX_HOURS * 3_600_000,
  };
}
