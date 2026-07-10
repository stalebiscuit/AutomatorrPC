import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makePairKey } from '@automatorr/shared';
import { PLACEHOLDER_PROSE } from './PlaceholderVerdictProvider.js';
import type { VerdictInput, VerdictProvider, VerdictResult } from './VerdictProvider.js';

/** Label recorded on served verdicts (the model these were pre-generated with). */
const MODEL = 'claude-opus-4-8';

/**
 * Serves pre-generated, grounded verdict prose for the seeded catalogue — every
 * valid same-category pair, keyed by `pairKey`. Deterministic and fully offline
 * (no API key, no live calls): the prose was authored by Claude against each
 * pair's real specs + scorecard. Any pair not in the map (e.g. parts added
 * after generation) gracefully falls back to the placeholder. Live per-pair
 * generation for arbitrary parts remains a later flip to VERDICT_PROVIDER=claude.
 */
export class SeededVerdictProvider implements VerdictProvider {
  readonly name = 'seeded';
  private readonly verdicts: Record<string, string>;

  constructor() {
    const path = fileURLToPath(new URL('./data/verdicts.json', import.meta.url));
    this.verdicts = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
  }

  getVerdict(input: VerdictInput): Promise<VerdictResult> {
    const key = makePairKey(input.a.category, input.a.slug, input.b.slug);
    const prose = this.verdicts[key];
    if (prose) return Promise.resolve({ prose, generated: true, model: MODEL });
    return Promise.resolve({ prose: PLACEHOLDER_PROSE, generated: false });
  }
}
