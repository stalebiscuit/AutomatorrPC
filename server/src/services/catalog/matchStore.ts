/**
 * Persistence around the matcher (Task 3 §5): loads confirmed aliases, resolves
 * a listing against the live catalogue, and routes low-confidence results to the
 * manual-review queue. Confirming a review writes an alias so the next
 * occurrence auto-resolves. All DB-bound (runs against Mongo).
 */
import { MatchAliasModel, MatchReviewModel, ComponentModel } from '../../models/index.js';
import { matchListing, type Listing, type CanonicalCandidate, type MatchResult } from './match.js';
import { canonicalKey } from './canonical.js';

/** Confirmed listing→canonical overrides, as the map matchListing expects. */
export async function loadAliases(): Promise<Record<string, string>> {
  const rows = await MatchAliasModel.find().lean();
  const map: Record<string, string> = {};
  for (const r of rows) map[r.canonicalKey as string] = r.slug as string;
  return map;
}

/** Catalogue candidates for a category (lightweight projection for matching). */
export async function candidatesFor(category: string): Promise<CanonicalCandidate[]> {
  const docs = await ComponentModel.find({ category }).select('category brand name slug').lean();
  return docs.map((d) => ({
    category: d.category as string,
    brand: d.brand as string,
    name: d.name as string,
    slug: d.slug as string,
  }));
}

export interface ResolveOptions {
  threshold?: number;
  /** enqueue a review when the result is unresolved (default true) */
  enqueue?: boolean;
}

/** Resolve a listing to a canonical slug; queue for review when unresolved. */
export async function resolveListing(
  listing: Listing,
  opts: ResolveOptions = {},
): Promise<MatchResult> {
  const [aliases, candidates] = await Promise.all([loadAliases(), candidatesFor(listing.category)]);
  const result = matchListing(listing, candidates, {
    ...(opts.threshold !== undefined ? { threshold: opts.threshold } : {}),
    aliases,
  });
  if (result.method === 'none' && (opts.enqueue ?? true)) {
    await enqueueReview(listing, result);
  }
  return result;
}

/** Add/refresh a pending review for a listing the matcher couldn't resolve. */
export async function enqueueReview(listing: Listing, result: MatchResult): Promise<void> {
  const listingKey = canonicalKey(listing.brand, listing.name, listing.category);
  await MatchReviewModel.updateOne(
    { listingKey, store: listing.store ?? 'unknown' },
    {
      $set: {
        category: listing.category,
        listingKey,
        brand: listing.brand,
        name: listing.name,
        store: listing.store ?? 'unknown',
        url: listing.url,
        price: listing.price,
        suggestedSlug: result.slug ?? undefined,
        score: result.score,
        status: 'pending',
      },
    },
    { upsert: true },
  );
}

/** Confirm a review → mark resolved and persist an alias for future auto-matches. */
export async function confirmReview(reviewId: string, slug: string): Promise<boolean> {
  const review = await MatchReviewModel.findById(reviewId);
  if (!review) return false;
  review.status = 'confirmed';
  review.resolvedSlug = slug;
  await review.save();
  await MatchAliasModel.updateOne(
    { canonicalKey: review.listingKey },
    { $set: { canonicalKey: review.listingKey, slug } },
    { upsert: true },
  );
  return true;
}

export async function rejectReview(reviewId: string): Promise<boolean> {
  const res = await MatchReviewModel.updateOne({ _id: reviewId }, { $set: { status: 'rejected' } });
  return res.matchedCount > 0;
}

export async function listPendingReviews(limit = 100): Promise<MatchReviewDocLike[]> {
  const rows = await MatchReviewModel.find({ status: 'pending' })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();
  return rows as unknown as MatchReviewDocLike[];
}

export interface MatchReviewDocLike {
  _id: unknown;
  category: string;
  listingKey: string;
  brand: string;
  name: string;
  store: string;
  url?: string;
  price?: number;
  suggestedSlug?: string;
  score: number;
  status: string;
}
