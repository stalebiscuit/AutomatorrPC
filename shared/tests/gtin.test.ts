import { describe, it, expect } from 'vitest';
import { isValidGtin, gtinError, normalizeGtin } from '../src/gtin.js';

describe('GTIN validation (join-key integrity)', () => {
  it('accepts correctly-checksummed GTIN-8/12/13/14 codes', () => {
    expect(isValidGtin('0730143314442')).toBe(true); // GTIN-13
    expect(isValidGtin('036000291452')).toBe(true); // UPC-12
    expect(isValidGtin('00012345678905')).toBe(true); // GTIN-14
    expect(isValidGtin('96385074')).toBe(true); // GTIN-8
  });

  it('rejects wrong length and bad check digits', () => {
    expect(isValidGtin('0730143314443')).toBe(false); // last digit wrong
    expect(isValidGtin('12345')).toBe(false);
    expect(isValidGtin('')).toBe(false);
    expect(isValidGtin(null)).toBe(false);
  });

  it('normalizes formatting (spaces / dashes stripped)', () => {
    expect(normalizeGtin(' 0730143-314442 ')).toBe('0730143314442');
    expect(isValidGtin('0730143-314442')).toBe(true);
  });

  it('reports a helpful reason for rejects', () => {
    expect(gtinError('')).toBe('empty');
    expect(gtinError('12345')).toContain('bad length');
    expect(gtinError('0730143314443')).toBe('check-digit mismatch');
    expect(gtinError('0730143314442')).toBeNull();
  });
});
