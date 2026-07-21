/**
 * Pure build scorer (spec §8) — the /100 headline metric. Deterministic blend of
 * compatibility, budget fit, completeness and balance. Any HARD incompatibility
 * caps the score. Weights are intentionally a single table so they can be tuned
 * with tests without touching the builder or the agent.
 */
import type { ResolvedBuild, BuildScoreResult, BuildScoreBreakdown } from './types.js';
import { BUILDER_CATEGORY_META } from './types.js';
import { buildTotal } from './pricing.js';
import { checkCompatibility } from './compatibility.js';
import { str } from './specUtil.js';

export const SCORE_WEIGHTS = {
  compatibility: 40,
  budgetFit: 25,
  completeness: 20,
  balance: 15,
} as const;

const HARD_CAP = 40;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function hasIgpu(build: ResolvedBuild): boolean {
  const cpu = build.find((b) => b.category === 'cpu')?.component;
  if (!cpu) return false;
  const ig = (str(cpu, 'igpu') ?? '').toLowerCase();
  return ig !== '' && ig !== 'none';
}

export interface ScoreOptions {
  budget?: number;
}

export function scoreBuild(build: ResolvedBuild, opts: ScoreOptions = {}): BuildScoreResult {
  const notes: string[] = [];
  const present = new Set(build.map((b) => b.category));

  // ── Compatibility (weight 40) ──
  const compat = checkCompatibility(build);
  const hardCount = compat.violations.filter((v) => v.severity === 'hard').length;
  const softCount = compat.violations.filter((v) => v.severity === 'soft').length;
  let compatibility: number;
  if (hardCount > 0) {
    compatibility = 0;
    notes.push(`${hardCount} incompatibility${hardCount > 1 ? 'ies' : ''} must be fixed.`);
  } else {
    compatibility = clamp(SCORE_WEIGHTS.compatibility - softCount * 8, 0, SCORE_WEIGHTS.compatibility);
    if (softCount > 0) notes.push(`${softCount} compatibility warning${softCount > 1 ? 's' : ''}.`);
  }

  // ── Completeness (weight 20) ──
  const essentials = BUILDER_CATEGORY_META.filter((m) => m.essential).map((m) => m.id);
  const needed = new Set<string>(essentials);
  if (!hasIgpu(build)) needed.add('gpu'); // discrete GPU required without integrated graphics
  const missing = [...needed].filter((c) => !present.has(c as never));
  const completenessFraction = 1 - missing.length / needed.size;
  const completeness = SCORE_WEIGHTS.completeness * completenessFraction;
  if (missing.length) notes.push(`Missing essential parts: ${missing.join(', ')}.`);

  // ── Budget fit (weight 25) ──
  let budgetFit = SCORE_WEIGHTS.budgetFit;
  const total = buildTotal(build);
  if (opts.budget && opts.budget > 0) {
    if (total > opts.budget) {
      const overFrac = (total - opts.budget) / opts.budget;
      budgetFit = SCORE_WEIGHTS.budgetFit * clamp(1 - overFrac * 2, 0, 1);
      notes.push(`Over budget by $${Math.round(total - opts.budget)}.`);
    } else {
      const utilization = total / opts.budget;
      budgetFit = SCORE_WEIGHTS.budgetFit * (0.6 + 0.4 * utilization);
    }
  }

  // ── Balance (weight 15) — CPU/GPU shouldn't be wildly mismatched ──
  let balance = SCORE_WEIGHTS.balance;
  const cpu = build.find((b) => b.category === 'cpu')?.component;
  const gpu = build.find((b) => b.category === 'gpu')?.component;
  if (cpu && gpu && cpu.performanceIndex > 0 && gpu.performanceIndex > 0) {
    const ratio = Math.max(cpu.performanceIndex, gpu.performanceIndex) / Math.min(cpu.performanceIndex, gpu.performanceIndex);
    balance = SCORE_WEIGHTS.balance * clamp(1 - (ratio - 1.5) / 2.5, 0, 1);
    if (ratio > 2.5) notes.push('CPU and GPU look imbalanced for their tiers.');
  }

  // Quality subscores are earned in proportion to how complete the build is, so
  // an empty or barely-started build can't score high just by having "no issues".
  const scaledCompat = compatibility * completenessFraction;
  const scaledBudget = budgetFit * completenessFraction;
  const scaledBalance = balance * completenessFraction;

  const breakdown: BuildScoreBreakdown = {
    compatibility: Math.round(scaledCompat),
    budgetFit: Math.round(scaledBudget),
    completeness: Math.round(completeness),
    balance: Math.round(scaledBalance),
  };
  let score = scaledCompat + scaledBudget + completeness + scaledBalance;
  if (hardCount > 0) score = Math.min(score, HARD_CAP);
  score = clamp(Math.round(score), 0, 100);

  return { score, breakdown, notes };
}

// re-export for convenience so callers can pull everything from one module
export { checkCompatibility } from './compatibility.js';
export { wattageEstimate, estimateWattage, recommendPsu } from './wattage.js';
export { bestPrice, buildTotal, pricesByMerchant } from './pricing.js';
