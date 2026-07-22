/**
 * Legal acknowledgement plumbing (launch-polish P1, revised 21 Jul 2026).
 *
 * Product decision: the consent popup now shows on EVERY page load, so the
 * stored acknowledgement no longer gates its display — it is kept purely as
 * a record of the last version/timestamp the visitor accepted. Bump
 * LEGAL_VERSION on material changes to any legal document.
 */
export const LEGAL_VERSION = 1;
export const LEGAL_UPDATED = '21 July 2026';

const ACK_KEY = 'sp_legal_ack';

interface LegalAck {
  version: number;
  ts: number;
}

export function acknowledgeLegal(): void {
  try {
    const ack: LegalAck = { version: LEGAL_VERSION, ts: Date.now() };
    localStorage.setItem(ACK_KEY, JSON.stringify(ack));
  } catch {
    /* localStorage unavailable — acknowledgement lasts for the session only */
  }
}
