import { randomBytes } from 'node:crypto';
import type {
  Build,
  BuildItem,
  BuildSummary,
  ResolvedBuild,
  ResolvedBuildPart,
} from '@automatorr/shared';
import {
  checkCompatibility,
  wattageEstimate,
  buildTotal,
  scoreBuild,
  pricesByMerchant,
} from '@automatorr/shared';
import { BuildModel, type BuildDoc } from '../../models/index.js';
import { getComponent } from '../catalog.js';
import type { HydratedDocument } from 'mongoose';

const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** URL-safe base62 short id for permalinks (no external dep). */
function shortId(len = 8): string {
  const bytes = randomBytes(len);
  let out = '';
  for (const b of bytes) out += ID_ALPHABET[b % ID_ALPHABET.length];
  return out;
}

function serializeBuild(doc: HydratedDocument<BuildDoc>): Build {
  const o = doc.toObject({ getters: false, virtuals: false });
  return {
    shortId: o.shortId,
    name: o.name ?? undefined,
    budget: o.budget ?? undefined,
    items: (o.items ?? []).map((i) => ({
      category: i.category as BuildItem['category'],
      slug: i.slug,
      chosenStore: i.chosenStore ?? undefined,
    })),
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : String(o.createdAt),
    updatedAt: o.updatedAt instanceof Date ? o.updatedAt.toISOString() : String(o.updatedAt),
  };
}

export interface BuildInput {
  name?: string;
  budget?: number;
  items: BuildItem[];
}

export async function createBuild(input: BuildInput): Promise<BuildDoc & { shortId: string }> {
  // Retry on the (astronomically unlikely) shortId collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const doc = await BuildModel.create({
        shortId: shortId(),
        name: input.name,
        budget: input.budget,
        items: input.items,
      });
      return doc as unknown as BuildDoc & { shortId: string };
    } catch (err: unknown) {
      const dup = typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
      if (!dup || attempt === 4) throw err;
    }
  }
  throw new Error('Could not allocate a unique build id');
}

export async function updateBuild(shortId: string, input: BuildInput): Promise<Build | null> {
  const doc = await BuildModel.findOneAndUpdate(
    { shortId },
    { name: input.name, budget: input.budget, items: input.items },
    { new: true },
  );
  return doc ? serializeBuild(doc) : null;
}

export async function getBuild(shortId: string): Promise<Build | null> {
  const doc = await BuildModel.findOne({ shortId });
  return doc ? serializeBuild(doc) : null;
}

/**
 * Resolve build items against the catalogue. Returns found parts (in build-table
 * order) and any items whose slug was missing — the hallucination guard: only
 * validated SKUs ever reach the render/score path.
 */
export async function resolveBuild(
  items: BuildItem[],
): Promise<{ resolved: ResolvedBuild; missing: BuildItem[] }> {
  const resolved: ResolvedBuildPart[] = [];
  const missing: BuildItem[] = [];
  await Promise.all(
    items.map(async (item) => {
      const component = await getComponent(item.category, item.slug);
      if (component) resolved.push({ category: item.category, component, chosenStore: item.chosenStore });
      else missing.push(item);
    }),
  );
  return { resolved, missing };
}

/** Full hydrated summary: resolved parts + compatibility + wattage + total + score. */
export async function summarizeBuild(
  shortId: string,
  budgetOverride?: number,
): Promise<BuildSummary | null> {
  const doc = await BuildModel.findOne({ shortId });
  if (!doc) return null;
  const build = serializeBuild(doc);
  const { resolved, missing } = await resolveBuild(build.items);
  const budget = budgetOverride ?? doc.budget ?? undefined;

  return {
    build,
    parts: resolved,
    missing,
    total: buildTotal(resolved),
    compatibility: checkCompatibility(resolved),
    wattage: wattageEstimate(resolved),
    score: scoreBuild(resolved, budget ? { budget } : {}),
  };
}

export async function merchantBreakdown(shortId: string) {
  const doc = await BuildModel.findOne({ shortId });
  if (!doc) return null;
  const build = serializeBuild(doc);
  const { resolved } = await resolveBuild(build.items);
  return pricesByMerchant(resolved);
}

export { serializeBuild };
