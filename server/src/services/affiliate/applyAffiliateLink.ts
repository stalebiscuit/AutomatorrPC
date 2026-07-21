import type { AffiliateLinkConfig } from '@automatorr/shared';

/**
 * Pure: decorate a raw product URL with a store's affiliate config.
 * A bad/missing config must NEVER break a link — worst case is pass-through.
 */
export function applyAffiliateLink(
  rawUrl: string,
  config: AffiliateLinkConfig | undefined,
): string {
  if (!config || config.mode === 'off') return rawUrl;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return rawUrl;

  if (config.mode === 'tag') {
    const tag = config.tag?.trim();
    if (!tag) return rawUrl;
    const name = config.paramName?.trim() || 'tag';
    parsed.searchParams.set(name, tag);
    return parsed.toString();
  }

  if (config.mode === 'wrapper') {
    const tpl = config.wrapperTemplate?.trim();
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

  return rawUrl;
}
