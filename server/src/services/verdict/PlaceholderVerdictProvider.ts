import type { VerdictProvider, VerdictResult } from './VerdictProvider.js';

/** The fixed placeholder sentence shown until the Claude provider is wired (Phase 3 task 3). */
export const PLACEHOLDER_PROSE =
  'Claude API will be wired to generate a comparison between the two components in a further version.';

export class PlaceholderVerdictProvider implements VerdictProvider {
  readonly name = 'placeholder';

  async getVerdict(): Promise<VerdictResult> {
    return { prose: PLACEHOLDER_PROSE, generated: false };
  }
}
