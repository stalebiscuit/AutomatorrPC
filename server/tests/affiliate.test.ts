import { describe, it, expect } from 'vitest';
import type { AffiliateLinkConfig } from '@automatorr/shared';
import { applyAffiliateLink } from '../src/services/affiliate/applyAffiliateLink.js';

const cfg = (over: Partial<AffiliateLinkConfig>): AffiliateLinkConfig => ({
  store: 'Test',
  mode: 'off',
  paramName: 'tag',
  tag: '',
  wrapperTemplate: '',
  ...over,
});

describe('applyAffiliateLink', () => {
  const URL0 = 'https://www.amazon.com.au/dp/B0C123';

  it('passes through when config is undefined or off', () => {
    expect(applyAffiliateLink(URL0, undefined)).toBe(URL0);
    expect(applyAffiliateLink(URL0, cfg({ mode: 'off' }))).toBe(URL0);
  });

  it('appends a tag param', () => {
    expect(applyAffiliateLink(URL0, cfg({ mode: 'tag', tag: 'automatorr-22' }))).toBe(
      'https://www.amazon.com.au/dp/B0C123?tag=automatorr-22',
    );
  });

  it('appends onto a URL that already has query params', () => {
    const out = applyAffiliateLink('https://x.au/s?q=cpu', cfg({ mode: 'tag', tag: 'a1' }));
    expect(out).toBe('https://x.au/s?q=cpu&tag=a1');
  });

  it('honours a custom param name', () => {
    const out = applyAffiliateLink(URL0, cfg({ mode: 'tag', paramName: 'aff', tag: '99' }));
    expect(out).toBe('https://www.amazon.com.au/dp/B0C123?aff=99');
  });

  it('passes through tag mode with an empty tag', () => {
    expect(applyAffiliateLink(URL0, cfg({ mode: 'tag', tag: '' }))).toBe(URL0);
  });

  it('substitutes the encoded url into a wrapper template', () => {
    const out = applyAffiliateLink(URL0, cfg({ mode: 'wrapper', wrapperTemplate: 'https://t.cfjump.com/1/t?url={url}' }));
    expect(out).toBe(`https://t.cfjump.com/1/t?url=${encodeURIComponent(URL0)}`);
  });

  it('passes through wrapper mode when the template lacks {url}', () => {
    expect(applyAffiliateLink(URL0, cfg({ mode: 'wrapper', wrapperTemplate: 'https://t.cfjump.com/1/t' }))).toBe(URL0);
  });

  it('passes through a non-http url', () => {
    expect(applyAffiliateLink('mailto:x@y.z', cfg({ mode: 'tag', tag: 'a1' }))).toBe('mailto:x@y.z');
    expect(applyAffiliateLink('not a url', cfg({ mode: 'tag', tag: 'a1' }))).toBe('not a url');
  });

  it('is idempotent in tag mode (re-decorating does not duplicate the param)', () => {
    const once = applyAffiliateLink(URL0, cfg({ mode: 'tag', tag: 'a1' }));
    const twice = applyAffiliateLink(once, cfg({ mode: 'tag', tag: 'a1' }));
    expect(twice).toBe(once);
  });

  it('percent-encodes tag values that contain special characters', () => {
    const out = applyAffiliateLink(URL0, cfg({ mode: 'tag', tag: 'a b&c' }));
    expect(out).toContain('tag=a+b%26c');
  });

  it('passes through a wrapper template that resolves to a non-http(s) scheme', () => {
    expect(
      applyAffiliateLink(URL0, cfg({ mode: 'wrapper', wrapperTemplate: 'javascript:alert(1)//{url}' })),
    ).toBe(URL0);
  });
});
