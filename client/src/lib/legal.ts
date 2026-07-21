/**
 * Legal acknowledgement plumbing (launch-polish P1).
 *
 * Bump LEGAL_VERSION whenever a *material* change is made to any legal
 * document — every visitor is then asked to re-acknowledge on their next
 * visit. Cosmetic wording fixes don't need a bump.
 */
export const LEGAL_VERSION = 1;
export const LEGAL_UPDATED = '21 July 2026';

const ACK_KEY = 'sp_legal_ack';

interface LegalAck {
  version: number;
  ts: number;
}

/** True when the current LEGAL_VERSION has been acknowledged in this browser. */
export function hasAcknowledgedLegal(): boolean {
  try {
    const raw = localStorage.getItem(ACK_KEY);
    if (!raw) return false;
    const ack = JSON.parse(raw) as Partial<LegalAck>;
    return typeof ack.version === 'number' && ack.version >= LEGAL_VERSION;
  } catch {
    // localStorage unavailable (private mode etc.) — don't nag on every render.
    return true;
  }
}

export function acknowledgeLegal(): void {
  try {
    const ack: LegalAck = { version: LEGAL_VERSION, ts: Date.now() };
    localStorage.setItem(ACK_KEY, JSON.stringify(ack));
  } catch {
    /* localStorage unavailable — acknowledgement lasts for the session only */
  }
}
