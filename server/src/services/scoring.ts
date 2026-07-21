import type { Category } from '@automatorr/shared';

/**
 * Performance-index normalisation (spec §10).
 *
 * The index is a *pure linear scaling* of the UserBenchmark raw score, against
 * a fixed per-category reference component pinned to index 1000. Values are
 * UNCAPPED — stronger parts exceed 1000. Because the mapping is linear and
 * positive, it preserves UB ordering (the operator chose UB-faithful scoring:
 * e.g. the i9-14900K, raw 131, outranks the 7800X3D, raw 121).
 *
 * Storage is normalised category-WIDE (one reference for SSD + HDD) so the two
 * subtypes sit on a single comparable scale (SSDs land far higher) — spec §11.
 *
 * This whole mapping is intentionally one small function: swap it (or the
 * reference table) and re-seed to re-tune indices without touching specs,
 * compare, or the UI.
 */

export interface CategoryReference {
  /** human-readable reference component, pinned to index 1000 */
  component: string;
  /** its UserBenchmark raw score (the divisor) */
  ubRaw: number;
}

export const REFERENCES: Record<Category, CategoryReference> = {
  cpu: { component: 'Intel Core i5-13600K', ubRaw: 122 },
  gpu: { component: 'NVIDIA GeForce RTX 4070', ubRaw: 80 },
  ram: { component: 'Kingston Fury Beast DDR5-5600 C40 2x16GB', ubRaw: 161 },
  // Category-wide storage reference (a flagship NVMe SSD) — SSDs land high,
  // HDDs land low, exactly as the spec expects for cross-subtype reads.
  storage: { component: 'Samsung 990 Pro 2TB', ubRaw: 406 },
};

export const REFERENCE_INDEX = 1000;

/** Normalise a raw UserBenchmark score into the uncapped Automatorr index. */
export function normaliseIndex(category: Category, ubRaw: number): number {
  const ref = REFERENCES[category];
  if (!ref || ref.ubRaw <= 0) {
    throw new Error(`No valid reference configured for category "${category}"`);
  }
  if (!Number.isFinite(ubRaw) || ubRaw < 0) {
    throw new Error(`Invalid ubRaw "${ubRaw}" for category "${category}"`);
  }
  return Math.round((ubRaw / ref.ubRaw) * REFERENCE_INDEX);
}
