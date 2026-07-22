/**
 * Private build edit tokens (review fix 1.3). The server issues a token once
 * at build creation; PATCH requires it. We remember tokens per shortId so the
 * creator can keep editing their build while everyone else's shared link
 * stays read-only. Storage failures degrade to "can view, can't re-edit".
 */
const KEY = 'sp_build_tokens';

function readMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function getEditToken(shortId: string): string | null {
  return readMap()[shortId] ?? null;
}

export function storeEditToken(shortId: string, token: string): void {
  try {
    const map = readMap();
    map[shortId] = token;
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable — the token lives only for this session */
  }
}
