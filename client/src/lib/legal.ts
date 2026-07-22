/**
 * Legal acknowledgement plumbing (launch-polish P1, revised 22 Jul 2026).
 *
 * Product decision: the consent popup shows once on first landing and is then
 * suppressed across refreshes/visits via the stored acknowledgement. Logging
 * out clears the acknowledgement (see `clearLegalAck`), so a returning visitor
 * must accept again. Bump LEGAL_VERSION on material changes to any legal
 * document to force everyone to re-accept.
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

/**
 * True when this visitor has already accepted the CURRENT legal version.
 * A stored ack for an older version (or malformed data) counts as not yet
 * acknowledged, so bumping LEGAL_VERSION re-prompts everyone.
 */
export function hasAcknowledgedLegal(): boolean {
  try {
    const raw = localStorage.getItem(ACK_KEY);
    if (!raw) return false;
    const ack = JSON.parse(raw) as Partial<LegalAck>;
    return ack?.version === LEGAL_VERSION;
  } catch {
    return false;
  }
}

/** Clear the stored acknowledgement so the consent popup shows again. */
export function clearLegalAck(): void {
  try {
    localStorage.removeItem(ACK_KEY);
  } catch {
    /* localStorage unavailable — nothing to clear */
  }
}
