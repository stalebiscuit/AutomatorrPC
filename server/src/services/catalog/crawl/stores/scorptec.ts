import type { StoreCrawlConfig } from '../crawlStore.js';

/**
 * Scorptec crawl config — verified against the live site 2026-07 (JS-rendered → run with --render).
 * Every listing reuses the same tile markup. The five "split" categories have no all- page, so each
 * maps to its SPANNING set of sub-listings (socket/brand pages that together cover the category once);
 * brand/capacity/gen filter subsets and laptop memory are omitted to avoid re-crawling duplicates.
 * Numbered pagination via ?page=N (~30/page); crawlCategory stops when a page returns 0 tiles.
 */
const paged = (paths: string[]): string[] => paths.map((p) => `${p}?page={page}`);

export const SCORPTEC_CONFIG: StoreCrawlConfig = {
  store: 'Scorptec',
  base: 'https://www.scorptec.com.au',
  categoryPath: {
    cpu: paged(['/product/cpu/intel', '/product/cpu/amd', '/product/cpu/server-workstation']),
    motherboard: paged([
      '/product/motherboards/intel-socket-1700', '/product/motherboards/intel-socket-1851',
      '/product/motherboards/amd-socket-am4', '/product/motherboards/amd-socket-am5',
      '/product/motherboards/amd-threadripper', '/product/motherboards/server-workstation',
    ]),
    ram: paged([
      '/product/memory/ddr5-desktop-memory', '/product/memory/ddr4-desktop-memory',
      '/product/memory/ddr3-desktop-memory', '/product/memory/ecc-memory',
    ]),
    gpu: paged([
      '/product/graphics-cards/nvidia', '/product/graphics-cards/amd',
      '/product/graphics-cards/intel', '/product/graphics-cards/workstation',
    ]),
    storage: paged([
      '/product/hard-drives-and-ssds/solid-state-drives--ssd', '/product/hard-drives-and-ssds/hdd-3.5-drives',
    ]),
    cooler: '/product/cooling/cpu-coolers?page={page}',
    case: '/product/cases/all-cases?page={page}',
    psu: '/product/power-supplies/all-power-supplies?page={page}',
    monitor: '/product/monitors/all-monitors?page={page}',
  },
  tileSelector: 'div.product-list-detail',
  nameSelector: '.detail-product-title',
  priceSelector: '.detail-product-price',
  imageSelector: 'img.lazy',
  linkSelector: 'a.inherit-class',
  maxPages: 40,
  productUrlMustInclude: '/product/',
};
