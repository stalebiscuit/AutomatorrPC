import type { CompareCategory } from '@automatorr/shared';
import { api } from './api.js';

const KEY = 'automatorr_session_id';

/** Anonymous, first-party session id (no PII) — spec §6. */
export function getSessionId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

/** Fire-and-forget search/select event. */
export function trackSearch(input: {
  category: CompareCategory;
  query?: string;
  componentId?: string;
}): void {
  void api
    .postSearchEvent({ type: 'search', sessionId: getSessionId(), ...input })
    .catch(() => undefined);
}

/** Fire-and-forget comparison-view event. */
export function trackView(input: { category: CompareCategory; pairKey: string }): void {
  void api
    .postSearchEvent({ type: 'view', sessionId: getSessionId(), ...input })
    .catch(() => undefined);
}

/** Record a price-link click, then resolve so the caller can open the store. */
export async function trackClick(input: {
  componentId: string;
  store: string;
  url: string;
}): Promise<void> {
  try {
    await api.postClickEvent({ sessionId: getSessionId(), ...input });
  } catch {
    /* analytics must never block the outbound click */
  }
}
