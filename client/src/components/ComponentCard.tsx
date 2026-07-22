import { useState } from 'react';
import type { Component, CompareRow } from '@automatorr/shared';
import { CategoryRender } from './CategoryRender.js';
import { conceptAsset } from '../lib/partImage.js';
import { PriceList } from './PriceList.js';
import { trackClick } from '../lib/session.js';

interface Props {
  component: Component;
  rows: CompareRow[];
  side: 'a' | 'b';
  win: boolean;
}

// Shown via the score block / PriceList rather than as plain spec rows.
const HIDDEN_ROWS = new Set(['performanceIndex', 'price']);

/**
 * Product image with graceful fallback: real asset -> local SVG placeholder
 * (same basename, .svg) -> per-category Automatorr render. Guarantees the thumb
 * never shows a broken image if an asset is missing.
 */
/**
 * Compare-card image: a LOCAL product/logo/concept asset ("/images/…") → the category concept
 * render (brand logo for CPU/GPU, DDR5 / drive render for RAM/storage) → the wireframe placeholder.
 * External retailer photo URLs are skipped (they hotlink-block / 404), so nothing broken shows.
 */
function Thumb({
  imageUrl,
  category,
  name,
  win,
  brand,
  specs,
}: {
  imageUrl: string | null | undefined;
  category: Component['category'];
  name: string;
  win: boolean;
  brand: string;
  specs: Component['specs'];
}) {
  const candidates = [
    imageUrl && imageUrl.startsWith('/') ? imageUrl : null,
    conceptAsset(category, brand, name, specs),
  ].filter((x): x is string => !!x);
  const [idx, setIdx] = useState(0);
  const src = candidates[idx];
  if (!src) return <CategoryRender category={category} win={win} />;
  return <img src={src} alt={name} loading="lazy" onError={() => setIdx((i) => i + 1)} />;
}

export function ComponentCard({ component, rows, side, win }: Props) {
  const specRows = rows.filter((r) => !HIDDEN_ROWS.has(r.key));
  const value = (r: CompareRow) => (side === 'a' ? r.displayA : r.displayB);
  const leads = (r: CompareRow) => r.lead === side;

  const lowest = component.prices.length
    ? [...component.prices].sort((a, b) => a.price - b.price)[0]!
    : null;

  // Review fix 1.5: a real anchor with fire-and-forget tracking. Awaiting the
  // tracking POST before window.open destroyed the user-activation gesture,
  // so Safari/Firefox popup blockers silently ate the store tab.
  const onSeeAll = () => {
    if (!lowest) return;
    void trackClick({ componentId: component.id, store: lowest.store, url: lowest.url });
  };

  return (
    <article className={`card${win ? ' win' : ''}`} aria-label={`${component.name}${win ? ' — winner' : ''}`}>
      {win && (
        <div className="badge">
          <span aria-hidden="true">★</span> OUTCLASSES
        </div>
      )}

      <div className="thumb">
        <Thumb
          key={component.imageUrl ?? component.id}
          imageUrl={component.imageUrl}
          category={component.category}
          name={component.name}
          win={win}
          brand={component.brand}
          specs={component.specs}
        />
      </div>

      <div className="eyebrow-b">{component.brand}</div>
      <h3 className="name">{component.name}</h3>

      {component.performanceIndex > 0 && (
        <div className="score">
          <div className="lbl">Performance score</div>
          <div className="val">
            {component.performanceIndex.toLocaleString('en-AU')}
            <span className="unit">uncapped index</span>
          </div>
        </div>
      )}

      <div className="specs">
        {specRows.map((r) => (
          <div className="row" key={r.key}>
            <span className="k">{r.label}</span>
            <span className="v">
              {value(r)}
              {leads(r) && <span className="lead-tag">Lead</span>}
            </span>
          </div>
        ))}
      </div>

      <PriceList componentId={component.id} prices={component.prices} />

      {lowest ? (
        <a
          className={`cta ${win ? 'solid' : 'outline'}`}
          href={lowest.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onSeeAll}
        >
          SEE ALL PRICES &gt;
        </a>
      ) : (
        <button type="button" className={`cta ${win ? 'solid' : 'outline'}`} disabled>
          SEE ALL PRICES &gt;
        </button>
      )}
    </article>
  );
}
