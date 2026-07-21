import pLimit from 'p-limit';
import type { Component, PriceQuote } from '@automatorr/shared';
import { loadConfig } from '../../config.js';
import { logger } from '../../lib/logger.js';
import type { Fetcher, PriceProvider } from './PriceProvider.js';
import { RETAILERS, type RetailerAdapter } from './retailers/index.js';
import { isAllowed } from './robots.js';

export interface ScraperOptions {
  fetcher?: Fetcher;
  userAgent?: string;
  concurrency?: number;
  perDomainDelayMs?: number;
  timeoutMs?: number;
  retries?: number;
  respectRobots?: boolean;
  adapters?: RetailerAdapter[];
}

const defaultFetcher: Fetcher = (url, init) => fetch(url, init as RequestInit);

/**
 * v1 pricing provider (spec §12): runs the hardcoded AU retailer adapters with
 * a concurrency cap, per-domain delay, descriptive UA, timeouts + bounded
 * retries, and robots.txt respect. Each adapter is isolated — one failing
 * retailer never breaks the run. Never called inline on a request: driven by
 * the scheduler / `npm run scrape`.
 */
export class ScraperPriceProvider implements PriceProvider {
  readonly name = 'scraper';
  private readonly fetcher: Fetcher;
  private readonly userAgent: string;
  private readonly limit: ReturnType<typeof pLimit>;
  private readonly perDomainDelayMs: number;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly respectRobots: boolean;
  private readonly adapters: RetailerAdapter[];
  private readonly lastHitByDomain = new Map<string, number>();

  constructor(opts: ScraperOptions = {}) {
    const cfg = loadConfig();
    this.fetcher = opts.fetcher ?? defaultFetcher;
    this.userAgent = opts.userAgent ?? cfg.SCRAPE_USER_AGENT;
    this.limit = pLimit(opts.concurrency ?? 3);
    this.perDomainDelayMs = opts.perDomainDelayMs ?? 1500;
    this.timeoutMs = opts.timeoutMs ?? 10000;
    this.retries = opts.retries ?? 2;
    this.respectRobots = opts.respectRobots ?? true;
    this.adapters = opts.adapters ?? RETAILERS;
  }

  async getPrices(component: Component): Promise<PriceQuote[]> {
    const tasks = this.adapters.map((adapter) =>
      this.limit(() => this.runAdapter(adapter, component)),
    );
    const results = await Promise.all(tasks);
    return results.filter((q): q is PriceQuote => q !== null);
  }

  /**
   * DB-4 Tier 2: find a product image URL for a component by scanning retailers in
   * order and returning the first thumbnail found. Sequential (respects per-domain
   * throttling) and short-circuits on the first hit. Never throws — returns null.
   */
  async getImage(component: Component): Promise<string | null> {
    for (const adapter of this.adapters) {
      if (!adapter.parseImage) continue;
      const img = await this.runAdapterImage(adapter, component);
      if (img) return img;
    }
    return null;
  }

  private async runAdapterImage(adapter: RetailerAdapter, component: Component): Promise<string | null> {
    try {
      const url = adapter.buildSearchUrl(component);
      const { pathname, search } = new URL(url);
      if (this.respectRobots) {
        const allowed = await isAllowed(adapter.domain, pathname + search, this.userAgent, this.fetcher);
        if (!allowed) return null;
      }
      await this.throttle(adapter.domain);
      const html = await this.fetchHtml(url);
      if (html === null) return null;
      return adapter.parseImage?.(html, component) ?? null;
    } catch (err) {
      logger.warn(`[${adapter.store}] image adapter error for "${component.name}"`, err);
      return null;
    }
  }

  private async runAdapter(
    adapter: RetailerAdapter,
    component: Component,
  ): Promise<PriceQuote | null> {
    try {
      const url = adapter.buildSearchUrl(component);
      const { pathname, search } = new URL(url);
      if (this.respectRobots) {
        const allowed = await isAllowed(adapter.domain, pathname + search, this.userAgent, this.fetcher);
        if (!allowed) {
          logger.warn(`[${adapter.store}] disallowed by robots.txt — skipping`);
          return null;
        }
      }
      await this.throttle(adapter.domain);
      const html = await this.fetchHtml(url);
      if (html === null) return null;
      const parsed = adapter.parse(html, component);
      if (!parsed) return null;
      return {
        store: adapter.store,
        price: parsed.price,
        currency: 'AUD',
        url: parsed.url,
        lastUpdated: new Date().toISOString(),
      };
    } catch (err) {
      // Isolated: log and move on (spec §12).
      logger.warn(`[${adapter.store}] adapter error for "${component.name}"`, err);
      return null;
    }
  }

  private async throttle(domain: string): Promise<void> {
    const last = this.lastHitByDomain.get(domain);
    if (last !== undefined) {
      const wait = this.perDomainDelayMs - (Date.now() - last);
      if (wait > 0) await sleep(wait);
    }
    this.lastHitByDomain.set(domain, Date.now());
  }

  private async fetchHtml(url: string): Promise<string | null> {
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetcher(url, {
          headers: { 'user-agent': this.userAgent, accept: 'text/html' },
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.ok) return await res.text();
        if (res.status >= 400 && res.status < 500) return null; // not retryable
      } catch (err) {
        clearTimeout(timer);
        if (attempt === this.retries) {
          logger.warn(`fetch failed (${url}) after ${attempt + 1} tries`, err);
          return null;
        }
      }
      await sleep(300 * (attempt + 1));
    }
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
