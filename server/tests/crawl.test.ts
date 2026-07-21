import { describe, it, expect } from 'vitest';
import { extractTiles, type StoreCrawlConfig } from '../src/services/catalog/crawl/crawlStore.js';

const PLE: StoreCrawlConfig = {
  store: 'PLE Computers',
  base: 'https://www.ple.com.au',
  categoryPath: { gpu: '/Categories/259/Graphics-Cards' },
  tileSelector: 'div.itemGrid2TileStandard',
  nameSelector: 'div.itemGrid2TileStandardDescription a',
  priceSelector: 'div.itemGrid2TileStandardPrice',
  imageSelector: 'img.defaultImage2image',
  linkSelector: 'div.itemGrid2TileStandardDescription a',
  productUrlMustInclude: '/products/',
};

const tile = (href: string, name: string, img: string, price: string): string =>
  `<div class="itemGrid2TileStandard"><div class="itemGrid2TileStandardDescription"><a href="${href}">${name}</a></div>` +
  `<img class="defaultImage2image defaultImage2Primary" src="${img}"><div class="itemGrid2TileStandardPrice">${price}</div></div>`;

describe('live-store crawler — extractTiles (verified PLE structure)', () => {
  it('pulls name / price / image / url from the description-anchor tile', () => {
    const html = tile('/products/685718/msi-rtx-5060-ti', 'MSI GeForce RTX 5060 Ti 16GB', 'https://plecom.imgix.net/iit-473547-685718.png', '$999');
    const tiles = extractTiles(html, 'gpu', PLE);
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({
      name: 'MSI GeForce RTX 5060 Ti 16GB', price: 999,
      imageUrl: 'https://plecom.imgix.net/iit-473547-685718.png',
      url: 'https://www.ple.com.au/products/685718/msi-rtx-5060-ti',
    });
  });

  it('returns null image for a lazy-loaded placeholder but keeps name/price/url', () => {
    const html = tile('/products/684303/corsair-vengeance', 'Corsair Vengeance DDR5-5200 16GB', 'data:image/gif;base64,R0lGOD', '$379');
    const t = extractTiles(html, 'gpu', PLE)[0]!;
    expect(t.imageUrl).toBeNull();
    expect(t.name).toBe('Corsair Vengeance DDR5-5200 16GB');
    expect(t.price).toBe(379);
  });

  it('skips non-/products/ tiles (e.g. the storage bundle)', () => {
    const html = tile('/bundles/999/jonsbo-nas', 'Jonsbo NAS Case + HDDs Bundle', 'https://plecom.imgix.net/x.png', '$1299');
    expect(extractTiles(html, 'storage', PLE)).toHaveLength(0);
  });
});
