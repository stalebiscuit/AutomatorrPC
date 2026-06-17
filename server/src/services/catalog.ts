import type { Category, Component } from '@automatorr/shared';
import { ComponentModel } from '../models/index.js';
import { serializeComponent } from '../lib/serialize.js';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * List components in a category, newest-strongest first. When `q` is given it
 * filters by a case-insensitive substring on name/brand (picker-friendly), then
 * sorts by performanceIndex desc so the strongest matches surface first.
 */
export async function listComponents(category: Category, q?: string): Promise<Component[]> {
  const filter: Record<string, unknown> = { category };
  if (q && q.trim()) {
    const rx = new RegExp(escapeRegex(q.trim()), 'i');
    filter.$or = [{ name: rx }, { brand: rx }];
  }
  const docs = await ComponentModel.find(filter).sort({ performanceIndex: -1 }).limit(50);
  return docs.map(serializeComponent);
}

export async function getComponent(category: Category, slug: string): Promise<Component | null> {
  const doc = await ComponentModel.findOne({ category, slug });
  return doc ? serializeComponent(doc) : null;
}

/** Resolve two slugs to components; throws a not-found-ish null tuple handling upstream. */
export async function getPair(
  category: Category,
  slugA: string,
  slugB: string,
): Promise<{ a: Component | null; b: Component | null }> {
  const [a, b] = await Promise.all([
    getComponent(category, slugA),
    getComponent(category, slugB),
  ]);
  return { a, b };
}
