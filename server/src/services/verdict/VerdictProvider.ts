import type { Component, Scorecard } from '@automatorr/shared';
import { loadConfig } from '../../config.js';
import { PlaceholderVerdictProvider } from './PlaceholderVerdictProvider.js';
import { SeededVerdictProvider } from './SeededVerdictProvider.js';
import { ClaudeVerdictProvider } from './ClaudeVerdictProvider.js';

export interface VerdictInput {
  a: Component;
  b: Component;
  scorecard: Scorecard;
}

export interface VerdictResult {
  prose: string;
  generated: boolean;
  model?: string;
}

/** The stable verdict contract. v1 = placeholder; later = Claude (spec §7, §14). */
export interface VerdictProvider {
  readonly name: string;
  getVerdict(input: VerdictInput): Promise<VerdictResult>;
}

let cached: VerdictProvider | null = null;

/** Factory — selects the provider from VERDICT_PROVIDER. */
export function getVerdictProvider(): VerdictProvider {
  if (cached) return cached;
  const which = loadConfig().VERDICT_PROVIDER;
  switch (which) {
    case 'seeded':
      cached = new SeededVerdictProvider();
      break;
    case 'claude':
      cached = new ClaudeVerdictProvider();
      break;
    case 'placeholder':
    default:
      cached = new PlaceholderVerdictProvider();
      break;
  }
  return cached;
}

/** Test helper to reset the memoised provider. */
export function resetVerdictProvider(): void {
  cached = null;
}
