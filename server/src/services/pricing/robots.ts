import type { Fetcher } from './PriceProvider.js';
import { logger } from '../../lib/logger.js';

interface RobotsRules {
  disallow: string[];
}

const cache = new Map<string, RobotsRules>();

/** Parse the Disallow rules that apply to our UA (falling back to `*`). */
function parseRobots(text: string, ua: string): RobotsRules {
  const lines = text.split(/\r?\n/);
  const groups: { agents: string[]; disallow: string[] }[] = [];
  let current: { agents: string[]; disallow: string[] } | null = null;

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      if (!current || current.disallow.length > 0) {
        current = { agents: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (field === 'disallow' && current) {
      current.disallow.push(value);
    }
  }

  const uaLower = ua.toLowerCase();
  const match =
    groups.find((g) => g.agents.some((a) => a !== '*' && uaLower.includes(a))) ??
    groups.find((g) => g.agents.includes('*'));
  return { disallow: match ? match.disallow.filter(Boolean) : [] };
}

async function getRules(domain: string, ua: string, fetcher: Fetcher): Promise<RobotsRules> {
  const cached = cache.get(domain);
  if (cached) return cached;
  let rules: RobotsRules = { disallow: [] };
  try {
    const res = await fetcher(`https://${domain}/robots.txt`, { headers: { 'user-agent': ua } });
    if (res.ok) rules = parseRobots(await res.text(), ua);
  } catch (err) {
    logger.warn(`robots.txt unavailable for ${domain}; proceeding cautiously`, err);
  }
  cache.set(domain, rules);
  return rules;
}

/** Is `path` allowed for our UA under the domain's robots.txt? */
export async function isAllowed(
  domain: string,
  path: string,
  ua: string,
  fetcher: Fetcher,
): Promise<boolean> {
  const rules = await getRules(domain, ua, fetcher);
  return !rules.disallow.some((rule) => rule !== '' && path.startsWith(rule));
}

export function clearRobotsCache(): void {
  cache.clear();
}
