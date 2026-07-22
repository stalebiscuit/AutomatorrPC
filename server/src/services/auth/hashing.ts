import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** sha256 hex digest. Used for OTP codes and opaque refresh tokens at rest. */
export const sha256Hex = (input: string): string =>
  createHash('sha256').update(input).digest('hex');

/** Random hex string (default 16 bytes → 32 chars). */
export const randomHex = (bytes = 16): string => randomBytes(bytes).toString('hex');

/** Opaque URL-safe token (default 32 bytes → 43 chars). */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

/** Zero-padded numeric one-time code. */
export const randomNumericCode = (digits = 6): string =>
  String(randomInt(0, 10 ** digits)).padStart(digits, '0');

/** Constant-time comparison of two hex strings. */
export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
