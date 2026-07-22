/** Canonical email form used everywhere (allow-lists, OTP lookup, user keys). */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** Domain part of an email (already normalized). Empty string if malformed. */
export const emailDomain = (email: string): string => normalizeEmail(email).split('@')[1] ?? '';
