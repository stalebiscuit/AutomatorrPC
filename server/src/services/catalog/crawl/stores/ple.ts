import type { StoreCrawlConfig } from '../crawlStore.js';

/**
 * PLE Computers crawl config — verified against the live site 2026-07.
 * PLE is server-rendered, so plain fetch works. Each category is a SINGLE page (no
 * pagination — ?page= is ignored), so the category path has no {page} token and the
 * crawler fetches it once.
 *
 * Notes from inspection:
 *  - name + product link are the SAME anchor: `div.itemGrid2TileStandardDescription a`.
 *  - images are lazy-loaded (real imgix URL swaps into src on scroll; placeholders otherwise),
 *    so a plain fetch may yield null images — those are backfilled by `db4:images` afterwards.
 *  - storage is one combined SSD+HDD listing; the crawler skips non-/products/ tiles (bundles).
 *  - CPUs are decoded via a model->socket table + UserBenchmark CSV score match (skip-if-unscoreable).
 */
export const PLE_CONFIG: StoreCrawlConfig = {
  store: 'PLE Computers',
  base: 'https://www.ple.com.au',
  categoryPath: {
    cpu: '/Categories/235/CPUs',
    motherboard: '/Categories/302/Motherboards',
    gpu: '/Categories/259/Graphics-Cards',
    ram: '/Categories/282/Memory-RAM',
    storage: '/Categories/243/Hard-Drives-and-SSDs',
    cooler: '/Categories/444/CPU-Coolers',
    case: '/Categories/227/Cases',
    psu: '/Categories/318/Power-Supplies',
    monitor: '/Categories/296/Monitors',
  },
  tileSelector: 'div.itemGrid2TileStandard',
  nameSelector: 'div.itemGrid2TileStandardDescription a',
  priceSelector: 'div.itemGrid2TileStandardPrice',
  imageSelector: 'img.defaultImage2image',
  linkSelector: 'div.itemGrid2TileStandardDescription a',
  maxPages: 1,
  productUrlMustInclude: '/products/',
};
