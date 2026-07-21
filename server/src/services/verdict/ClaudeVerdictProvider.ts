import type { VerdictInput, VerdictProvider, VerdictResult } from './VerdictProvider.js';

/**
 * TODO(phase: later) — wire the Anthropic SDK (Haiku-class model) here.
 *
 * Designed-for (spec §14): grounded on the two components' specs + the index
 * gap in `input.scorecard`, cache-first via the `verdicts` collection keyed by
 * `pairKey`, selected by setting `VERDICT_PROVIDER=claude`. This stub already
 * implements the interface so the factory wiring is proven (Phase 10 DoD); it
 * simply throws until the integration lands — no other part of the app changes.
 */
export class ClaudeVerdictProvider implements VerdictProvider {
  readonly name = 'claude';

  async getVerdict(_input: VerdictInput): Promise<VerdictResult> {
    throw new Error(
      'ClaudeVerdictProvider is not implemented yet. Set VERDICT_PROVIDER=placeholder, ' +
        'or wire the Anthropic SDK per spec §14.',
    );
  }
}
