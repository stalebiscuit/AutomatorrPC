import type { RetailerAdapter } from './types.js';
import { scorptec } from './scorptec.js';
import { ple } from './ple.js';
import { pccasegear } from './pccasegear.js';
import { amazonAu, centreCom } from './stubs.js';

/** Hardcoded AU retailer registry (spec §12). */
export const RETAILERS: RetailerAdapter[] = [scorptec, ple, pccasegear, amazonAu, centreCom];

export type { RetailerAdapter } from './types.js';
