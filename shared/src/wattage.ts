/**
 * Pure wattage estimator (spec §6.4). estimate ≈ Σ CPU TDP + Σ GPU TBP plus a
 * fixed per-component overhead; recommend a PSU with ~30% headroom rounded up
 * to a standard size. Reused by the builder UI and the agent's sizing tool.
 */
import type { ResolvedBuild, WattageEstimate, Component } from './types.js';
import { num, moduleCount } from './specUtil.js';

export const WATTAGE_OVERHEAD = {
  baseline: 30, // fans, USB, board VRM idle
  motherboard: 50,
  ramPerStick: 5,
  storagePerDrive: 5,
  cooler: 15,
} as const;

const STANDARD_PSU_SIZES = [450, 550, 650, 750, 850, 1000, 1200, 1600] as const;
export const PSU_HEADROOM = 1.3;

function partsOf(build: ResolvedBuild, category: string): Component[] {
  return build.filter((b) => b.category === category).map((b) => b.component);
}

/** Estimate system draw (watts) from the selected parts. */
export function estimateWattage(build: ResolvedBuild): number {
  // An empty build draws nothing — the baseline overhead only applies once at
  // least one real part is present (otherwise the UI shows "30 W" for nothing).
  if (build.length === 0) return 0;
  let w = WATTAGE_OVERHEAD.baseline;

  for (const cpu of partsOf(build, 'cpu')) w += num(cpu, 'tdp') ?? 65;
  for (const gpu of partsOf(build, 'gpu')) w += num(gpu, 'tbp') ?? 0;
  for (const _mobo of partsOf(build, 'motherboard')) w += WATTAGE_OVERHEAD.motherboard;
  for (const ram of partsOf(build, 'ram')) w += WATTAGE_OVERHEAD.ramPerStick * moduleCount(ram);
  for (const _drive of partsOf(build, 'storage')) w += WATTAGE_OVERHEAD.storagePerDrive;
  for (const _cooler of partsOf(build, 'cooler')) w += WATTAGE_OVERHEAD.cooler;

  return Math.round(w);
}

/** Round a raw watt figure up to the nearest standard PSU size. */
export function recommendPsu(estimatedWatts: number): number {
  const target = estimatedWatts * PSU_HEADROOM;
  for (const size of STANDARD_PSU_SIZES) {
    if (size >= target) return size;
  }
  return STANDARD_PSU_SIZES[STANDARD_PSU_SIZES.length - 1]!;
}

export function wattageEstimate(build: ResolvedBuild): WattageEstimate {
  const estimatedWatts = estimateWattage(build);
  return { estimatedWatts, recommendedPsuWatts: recommendPsu(estimatedWatts) };
}
