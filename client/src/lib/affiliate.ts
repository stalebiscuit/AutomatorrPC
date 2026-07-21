import type { AffiliateLinkConfig } from '@automatorr/shared';

/**
 * Display-only mirror of the server transform, for the admin modal's live
 * preview. The server (services/affiliate/applyAffiliateLink) is authoritative.
 */
export function previewAffiliateLink(rawUrl: string, config: AffiliateLinkConfig): string {
  if (config.mode === 'off') return rawUrl;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return rawUrl;

  if (config.mode === 'tag') {
    const tag = config.tag.trim();
    if (!tag) return rawUrl;
    parsed.searchParams.set(config.paramName.trim() || 'tag', tag);
    return parsed.toString();
  }
  const tpl = config.wrapperTemplate.trim();
  if (!tpl || !tpl.includes('{url}')) return rawUrl;
  const out = tpl.replaceAll('{url}', encodeURIComponent(rawUrl));
  try {
    const u = new URL(out);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return rawUrl;
  } catch {
    return rawUrl;
  }
  return out;
}
