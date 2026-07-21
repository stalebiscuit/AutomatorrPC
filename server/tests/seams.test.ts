import { describe, it, expect, afterEach } from 'vitest';
import { setConfigForTests } from '../src/config.js';
import {
  getVerdictProvider,
  resetVerdictProvider,
} from '../src/services/verdict/VerdictProvider.js';
import {
  getPriceProvider,
  setPriceProviderForTests,
} from '../src/services/pricing/PriceProvider.js';
import { PLACEHOLDER_PROSE } from '../src/services/verdict/PlaceholderVerdictProvider.js';

describe('Phase 10 — provider seams resolve via config (spec §14)', () => {
  afterEach(() => {
    resetVerdictProvider();
    setPriceProviderForTests(null);
    setConfigForTests({ VERDICT_PROVIDER: 'placeholder', PRICE_PROVIDER: 'scraper' });
  });

  it('VERDICT_PROVIDER=placeholder → fixed sentence, generated:false', async () => {
    setConfigForTests({ VERDICT_PROVIDER: 'placeholder' });
    resetVerdictProvider();
    const provider = getVerdictProvider();
    expect(provider.name).toBe('placeholder');
    const r = await provider.getVerdict({} as never);
    expect(r.prose).toBe(PLACEHOLDER_PROSE);
    expect(r.generated).toBe(false);
  });

  it('VERDICT_PROVIDER=claude → ClaudeVerdictProvider wired (throws not-implemented)', async () => {
    setConfigForTests({ VERDICT_PROVIDER: 'claude' });
    resetVerdictProvider();
    const provider = getVerdictProvider();
    expect(provider.name).toBe('claude');
    await expect(provider.getVerdict({} as never)).rejects.toThrow(/not implemented/i);
  });

  it('PRICE_PROVIDER=scraper → ScraperPriceProvider', async () => {
    setConfigForTests({ PRICE_PROVIDER: 'scraper' });
    setPriceProviderForTests(null);
    const provider = await getPriceProvider();
    expect(provider.name).toBe('scraper');
  });
});
