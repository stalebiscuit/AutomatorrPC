import type { RetailerAdapter } from './types.js';
import { scorptec } from './scorptec.js';
import { mwave } from './mwave.js';
import { ple } from './ple.js';
import { pccasegearAlgolia } from './pccasegearAlgolia.js';
import { amazonAu, centreCom } from './stubs.js';
import { umart, msy } from './umartMsy.js';

/**
 * AU retailer registry (spec §12; Task 3 §0 — 6 stores).
 * Implemented HTML adapters: Mwave, Scorptec, PLE, PCCaseGear.
 * Pending stubs (registered, parse → null until wired): Amazon (→ PA-API,
 * spec §14) and Centre Com (→ needs its JS instant-search API; the plain
 * /search + /catalogsearch endpoints 404 — see task3 plan §6).
 */
export const RETAILERS: RetailerAdapter[] = [
  amazonAu,
  mwave,
  scorptec,
  ple,
  pccasegearAlgolia,
  centreCom,
  umart,
  msy,
];

export type { RetailerAdapter } from './types.js';

/** Canonical retailer store names — the affiliate-config key set. */
/** Stores that can carry an affiliate link even when not price-scraped (feed / manual source). */
export const AFFILIATE_ONLY_STORES: string[] = ['JB Hi-Fi'];
/** All stores configurable in the affiliate admin (scraped retailers + affiliate-only stores). */
export const RETAILER_STORES: string[] = [...RETAILERS.map((r) => r.store), ...AFFILIATE_ONLY_STORES];
