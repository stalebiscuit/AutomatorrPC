import type { RetailerAdapter } from './types.js';
import { scorptec } from './scorptec.js';
import { mwave } from './mwave.js';
import { amazonAu } from './stubs.js';

/**
 * Hardcoded AU retailer registry (spec §12) — Sydney-standard stores.
 * Scorptec + Mwave are implemented HTML adapters; Amazon is a stub pending the
 * PA-API provider seam (spec §14 — Amazon disallows price scraping).
 */
export const RETAILERS: RetailerAdapter[] = [amazonAu, mwave, scorptec];

export type { RetailerAdapter } from './types.js';
