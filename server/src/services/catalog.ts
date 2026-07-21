import type {
  BuilderCategory,
  CompareCategory,
  Component,
  PartFilters,
  PartListResult,
} from '@automatorr/shared';
import { bestPrice, normalizeSocket } from '@automatorr/shared';
import { ComponentModel } from '../models/index.js';
import { serializeComponent } from '../lib/serialize.js';
import { decorateComponent, ensureFresh } from './affiliate/affiliateService.js';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Filtered, sorted, paginated catalogue query for the builder part-picker
 * (spec §9). Matching docs are fetched (capped), then price sorts + pagination
 * are applied in-memory because "cheapest quote" is a min over the price array.
 * Backwards compatible with the compare picker (which passes only category/q).
 */
export async function listComponents(filters: PartFilters): Promise<PartListResult> {
  const {
    category,
    q,
    manufacturer,
    socket,
    priceMin,
    priceMax,
    sort = 'performance',
    page = 1,
    pageSize = 25,
  } = filters;

  const mongo: Record<string, unknown> = { category };
  if (q && q.trim()) {
    const rx = new RegExp(escapeRegex(q.trim()), 'i');
    mongo.$or = [{ name: rx }, { brand: rx }];
  }
  if (manufacturer && manufacturer.trim()) {
    // Substring (contains) match, not an anchored exact match, so "asus" and
    // "asus rog" both work instead of requiring the exact stored brand.
    mongo.brand = new RegExp(escapeRegex(manufacturer.trim()), 'i');
  }
  if (priceMin !== undefined || priceMax !== undefined) {
    const cond: Record<string, number> = {};
    if (priceMin !== undefined) cond.$gte = priceMin;
    if (priceMax !== undefined) cond.$lte = priceMax;
    mongo['prices.price'] = cond;
  }

  const docs = await ComponentModel.find(mongo).limit(1000);
  let items = docs.map(serializeComponent);

  // Socket filter (in-memory): CPUs/motherboards carry a single `socket` string,
  // coolers carry a `socketSupport` CSV. Normalise both sides so "LGA 1700"
  // matches "LGA1700". Categories without a socket concept ignore the filter.
  if (socket && socket.trim()) {
    const want = normalizeSocket(socket.trim());
    items = items.filter((c) => {
      const single = c.specs.socket;
      if (typeof single === 'string' && single.trim()) {
        return normalizeSocket(single) === want;
      }
      const support = c.specs.socketSupport;
      if (typeof support === 'string' && support.trim()) {
        return support.split(',').some((x) => normalizeSocket(x) === want);
      }
      return false; // category has no socket field → excluded when a socket is required
    });
  }

  const priceOf = (c: Component): number => bestPrice(c) ?? Number.POSITIVE_INFINITY;
  switch (sort) {
    case 'name':
      items.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'priceAsc':
      items.sort((a, b) => priceOf(a) - priceOf(b));
      break;
    case 'priceDesc':
      items.sort((a, b) => priceOf(b) - priceOf(a));
      break;
    case 'performance':
    default:
      items.sort((a, b) => b.performanceIndex - a.performanceIndex);
      break;
  }

  const total = items.length;
  const start = (page - 1) * pageSize;
  await ensureFresh();
  const components = items.slice(start, start + pageSize).map(decorateComponent);
  return { components, total, page, pageSize };
}

export async function getComponent(
  category: BuilderCategory,
  slug: string,
): Promise<Component | null> {
  const doc = await ComponentModel.findOne({ category, slug });
  if (!doc) return null;
  await ensureFresh();
  return decorateComponent(serializeComponent(doc));
}

/** Resolve two slugs to comparable components (compare flow). */
export async function getPair(
  category: CompareCategory,
  slugA: string,
  slugB: string,
): Promise<{ a: Component | null; b: Component | null }> {
  const [a, b] = await Promise.all([getComponent(category, slugA), getComponent(category, slugB)]);
  return { a, b };
}
