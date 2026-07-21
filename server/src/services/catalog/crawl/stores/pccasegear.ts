import type { StoreCrawlConfig } from '../crawlStore.js';

/**
 * PCCaseGear crawl config — verified 2026-07 (JS-rendered → run with --render). No pagination:
 * each listing renders its whole grid on one page (maxPages: 1). Split categories exist only as
 * disjoint socket/gen sub-lists; brand subsets, laptop SODIMM and accessory/enclosure/dock lists
 * are omitted. Bundles (/bundle/) are mixed into component lists → productUrlMustInclude '/products/'
 * keeps only real products.
 */
export const PCCASEGEAR_CONFIG: StoreCrawlConfig = {
  store: 'PCCaseGear',
  base: 'https://www.pccasegear.com',
  categoryPath: {
    cpu: [
      '/category/187_2138/cpus/amd-am4-5000', '/category/187_2217/cpus/amd-am5-7000',
      '/category/187_2269/cpus/amd-am5-8000', '/category/187_2283/cpus/amd-am5-9000',
      '/category/187_2285/cpus/amd-tr5-threadripper', '/category/187_2180/cpus/intel-1700-12th-gen',
      '/category/187_2260/cpus/intel-1700-14th-gen', '/category/187_2290/cpus/intel-1851-core-ultra',
    ],
    motherboard: [
      '/category/138_2023/motherboards/amd-socket-am4-zen3', '/category/138_2220/motherboards/amd-socket-am5-zen4',
      '/category/138_2282/motherboards/amd-socket-am5-zen5', '/category/138_2062/motherboards/amd-socket-str5',
      '/category/138_2221/motherboards/intel-1700-13th-14th-gen', '/category/138_2291/motherboards/intel-1851-15th-gen',
    ],
    ram: [
      '/category/186_2181/memory/all-ddr5-memory', '/category/186_1782/memory/all-ddr4-memory',
      '/category/186_2360/memory/ecc-memory',
    ],
    gpu: [
      '/category/193_876/graphics-cards/nvidia-graphics-cards', '/category/193_877/graphics-cards/amd-graphics-cards',
      '/category/193_2225/graphics-cards/intel-graphics-cards', '/category/193_2279/graphics-cards/professional-cards',
    ],
    storage: [
      '/category/210_902/hard-drives-ssds/solid-state-drives-ssd', '/category/210_344/hard-drives-ssds/3-5-hard-drives',
    ],
    cooler: '/category/207_23/cooling/cpu-cooling',
    case: '/category/25_547/cases/all-models',
    psu: '/category/15_535/power-supplies/all-models',
    monitor: '/category/558_1094/monitors/all-monitor-models',
  },
  tileSelector: 'div.product-container',
  nameSelector: 'a.product-title',
  priceSelector: '.price',
  imageSelector: '.product-image img',
  linkSelector: 'a.product-title',
  maxPages: 1,
  productUrlMustInclude: '/products/',
};
