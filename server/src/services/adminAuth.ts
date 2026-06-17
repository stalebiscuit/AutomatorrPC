import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { loadConfig } from '../config.js';

export interface AdminTokenPayload {
  sub: string;
  role: 'admin';
}

export const ADMIN_COOKIE = 'admin_token';

/** Constant-ish credential check against env (single admin, spec §15). */
export async function verifyCredentials(username: string, password: string): Promise<boolean> {
  const cfg = loadConfig();
  if (username !== cfg.ADMIN_USERNAME) {
    // still run a hash compare to reduce timing signal
    await bcrypt.compare(password, cfg.ADMIN_PASSWORD_HASH).catch(() => false);
    return false;
  }
  return bcrypt.compare(password, cfg.ADMIN_PASSWORD_HASH);
}

export function issueToken(username: string): string {
  const cfg = loadConfig();
  const payload: AdminTokenPayload = { sub: username, role: 'admin' };
  return jwt.sign(payload, cfg.JWT_SECRET, { expiresIn: '12h' });
}

export function verifyToken(token: string): AdminTokenPayload {
  const cfg = loadConfig();
  const decoded = jwt.verify(token, cfg.JWT_SECRET);
  if (typeof decoded === 'string' || decoded.role !== 'admin') {
    throw new Error('Invalid admin token');
  }
  return { sub: String(decoded.sub), role: 'admin' };
}
