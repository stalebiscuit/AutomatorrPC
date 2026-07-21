/**
 * Headless-render Fetcher (DB-4 Tier 2). Drops into ScraperPriceProvider in place of
 * plain `fetch` so JS-rendered retailer pages (Mwave/Scorptec/PLE/PCCaseGear) actually
 * produce product cards — which makes both image sourcing AND live price scraping work.
 *
 * Playwright is an OPTIONAL dependency: it's imported dynamically, so the project builds
 * and installs without it. To use rendering, install once:
 *   npm i -D playwright --workspace server && npx playwright install chromium
 *
 * robots.txt is fetched with plain `fetch` (no need to render a text file), so the
 * provider's robots.txt respect keeps working unchanged.
 */
import { logger } from '../../lib/logger.js';
import type { Fetcher } from './PriceProvider.js';

export interface RenderFetcher extends Fetcher {
  close(): Promise<void>;
}

export interface RenderOptions {
  userAgent?: string;
  /** extra settle time (ms) after network idle, for lazy-loaded images */
  waitMs?: number;
  /** navigation/idle timeout (ms) */
  timeoutMs?: number;
}

export async function createRenderFetcher(opts: RenderOptions = {}): Promise<RenderFetcher> {
  // Variable specifier so tsc doesn't try to resolve the optional module at build time.
  const pkg = 'playwright';
  let chromium: { launch(o: { headless: boolean }): Promise<unknown> };
  try {
    ({ chromium } = (await import(pkg)) as { chromium: typeof chromium });
  } catch {
    throw new Error(
      'Headless rendering requires Playwright. Install it once:\n' +
        '  npm i -D playwright --workspace server\n' +
        '  npx playwright install chromium',
    );
  }

  const timeoutMs = opts.timeoutMs ?? 20000;
  const waitMs = opts.waitMs ?? 1200;

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const browser: any = await chromium.launch({ headless: true });
  const context: any = await browser.newContext({
    userAgent: opts.userAgent,
    viewport: { width: 1366, height: 900 },
  });
  logger.info('[render] Chromium launched');

  const fetcher = (async (url: string) => {
    // Don't render robots.txt — fetch it as plain text so the parser sees real directives.
    if (/\/robots\.txt$/i.test(new URL(url).pathname)) {
      const res = await fetch(url, { headers: opts.userAgent ? { 'user-agent': opts.userAgent } : {} });
      return { ok: res.ok, status: res.status, text: () => res.text() };
    }
    const page: any = await context.newPage();
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});
      if (waitMs) await page.waitForTimeout(waitMs);
      const html: string = await page.content();
      const status: number = resp?.status?.() ?? 200;
      return { ok: status >= 200 && status < 400, status, text: async () => html };
    } finally {
      await page.close().catch(() => {});
    }
  }) as RenderFetcher;

  fetcher.close = async () => {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    logger.info('[render] Chromium closed');
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return fetcher;
}
