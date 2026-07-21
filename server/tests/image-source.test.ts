import { describe, it, expect } from 'vitest';
import { firstCardImage, titleMatches } from '../src/services/pricing/retailers/types.js';
import { scorptec } from '../src/services/pricing/retailers/scorptec.js';
import { pccasegear } from '../src/services/pricing/retailers/pccasegear.js';
import { mwave } from '../src/services/pricing/retailers/mwave.js';

const BASE = 'https://shop.example.com';
const card = (inner: string): string => `<div class="product-item">${inner}</div>`;

describe('DB-4 Tier 2 — firstCardImage extractor', () => {
  it('extracts a plain <img src> and absolute-izes a relative path', () => {
    expect(firstCardImage(card('<img src="/media/products/rm750e.jpg">'), '.product-item', BASE)).toBe('https://shop.example.com/media/products/rm750e.jpg');
  });
  it('accepts a direct <img> selector too', () => {
    expect(firstCardImage('<img class="hero" src="/x/y.png">', 'img.hero', BASE)).toBe('https://shop.example.com/x/y.png');
  });
  it('prefers lazy-load attributes over an inline-data placeholder src', () => {
    expect(firstCardImage(card('<img src="data:image/gif;base64,AAAA" data-src="https://cdn.example.com/p/abc.webp">'), '.product-item', BASE)).toBe('https://cdn.example.com/p/abc.webp');
  });
  it('picks the last (largest) URL from a srcset', () => {
    expect(firstCardImage(card('<img srcset="/img/s.jpg 300w, /img/l.jpg 900w">'), '.product-item', BASE)).toBe('https://shop.example.com/img/l.jpg');
  });
  it('rejects placeholder / spinner / inline-data assets', () => {
    expect(firstCardImage(card('<img src="/assets/no-image.png">'), '.product-item', BASE)).toBeNull();
    expect(firstCardImage(card('<img src="/assets/loading-spinner.gif">'), '.product-item', BASE)).toBeNull();
    expect(firstCardImage(card('<img src="data:image/png;base64,AAAA">'), '.product-item', BASE)).toBeNull();
  });
});

describe('DB-4 Tier 2 — titleMatches guard', () => {
  it('matches when the model code appears in the card text', () => {
    expect(titleMatches('Deepcool LE720', 'Deepcool LE720 Digital 360mm AIO')).toBe(true);
    expect(titleMatches('Noctua NH-D15', 'Noctua NH-D15 chromax.black')).toBe(true);
  });
  it('rejects a sibling product (wrong model code)', () => {
    expect(titleMatches('Deepcool LE720', 'Deepcool AK400 Digital Air Cooler')).toBe(false);
    expect(titleMatches('Corsair RM750e', 'Corsair RM850e (2023)')).toBe(false);
  });
});

describe('DB-4 Tier 2 — retailer adapters (verified selectors + match guard)', () => {
  it('Mwave parseImage returns the image when the card title matches', () => {
    const html = `<ul class="productList"><li><a class="sliclickLogging" href="/products/x">Noctua NH-D15 chromax.black</a><img src="https://cdn.mwave.com.au/images/150/noctua_ac29747.jpg"></li></ul>`;
    expect(mwave.parseImage?.(html, { name: 'Noctua NH-D15' } as never)).toBe('https://cdn.mwave.com.au/images/150/noctua_ac29747.jpg');
  });
  it('Mwave parseImage returns null when the card is a different product', () => {
    const html = `<ul class="productList"><li><a class="sliclickLogging" href="/x">Deepcool AK400 Digital</a><img src="https://cdn.mwave.com.au/ak400.jpg"></li></ul>`;
    expect(mwave.parseImage?.(html, { name: 'Deepcool LE720' } as never)).toBeNull();
  });
  it('Scorptec parseImage unwraps ?f= (title matches)', () => {
    const html = `<div class="grid-product-wrapper sli_content"><div class="grid-product-title sli_title">Noctua NH-D15 G2</div><img src="//scorptec.resultspage.com/thumb.php?w=150&f=/images/products/329179_large.jpg"></div>`;
    expect(scorptec.parseImage?.(html, { name: 'Noctua NH-D15' } as never)).toBe('https://www.scorptec.com.au/images/products/329179_large.jpg');
  });
  it('PCCaseGear parseImage drops -thumb (title matches)', () => {
    const html = `<li class="ais-Hits-item"><div class="product-container list-view"><a class="product-title">Noctua NH-D15 G2 chromax</a><img src="https://files.pccasegear.com/images/NH-D15-G2-thumb.jpg"></div></li>`;
    expect(pccasegear.parseImage?.(html, { name: 'Noctua NH-D15' } as never)).toBe('https://files.pccasegear.com/images/NH-D15-G2.jpg');
  });
  it('Mwave parse reads price + product link', () => {
    const html = `<ul class="productList"><li><div class="price"><div class="current">$179.00</div></div><a class="sliclickLogging" href="/products/noctua-ac29747">x</a></li></ul>`;
    expect(mwave.parse(html, { name: 'Noctua NH-D15' } as never)).toEqual({ price: 179, url: 'https://www.mwave.com.au/products/noctua-ac29747' });
  });
});
