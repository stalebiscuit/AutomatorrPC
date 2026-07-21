import { useState } from 'react';
import type { Component, CompareRow } from '@automatorr/shared';
import { CategoryRender } from './CategoryRender.js';
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
function Thumb({
  imageUrl,
  category,
  name,
  win,
}: {
  imageUrl: string | null | undefined;
  category: Component['category'];
  name: string;
  win: boolean;
}) {
  const [src, setSrc] = useState<string | null>(imageUrl ?? null);
  const [broken, setBroken] = useState(false);
  // Compare cards use only local logo/render assets ("/images/…"). Crawled parts carry
  // external retailer photo URLs that hotlink-block or 404 (and don't always fire onError),
  // so skip straight to the branded placeholder — a broken image never shows in compare.
  const local = !!src && src.startsWith('/');
  if (!local || broken) return <CategoryRender category={category} win={win} />;
  return (
    <img
      src={src}
      alt={name}
      loading="lazy"
      onError={() => {
        const fallback = src.replace(/\.(png|jpe?g|webp)$/i, '.svg');
        if (fallback !== src) setSrc(fallback);
        else setBroken(true);
      }}
    />
  );
}

export function ComponentCard({ component, rows, side, win }: Props) {
  const specRows = rows.filter((r) => !HIDDEN_ROWS.has(r.key));
  const value = (r: CompareRow) => (side === 'a' ? r.displayA : r.displayB);
  const leads = (r: CompareRow) => r.lead === side;

  const lowest = component.prices.length
    ? [...component.prices].sort((a, b) => a.price - b.price)[0]!
    : null;

  const onSeeAll = async () => {
    if (!lowest) return;
    await trackClick({ componentId: component.id, store: lowest.store, url: lowest.url });
    window.open(lowest.url, '_blank', 'noopener,noreferrer');
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
        />
      </div>

      <div className="eyebrow-b">{component.brand}</div>
      <h3 className="name">{component.name}</h3>

      <div className="score">
        <div className="lbl">Performance score</div>
        <div className="val">
          {component.performanceIndex.toLocaleString('en-AU')}
          <span className="unit">uncapped index</span>
        </div>
      </div>

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

      <button
        type="button"
        className={`cta ${win ? 'solid' : 'outline'}`}
        onClick={() => void onSeeAll()}
        disabled={!lowest}
      >
        SEE ALL PRICES &gt;
      </button>
    </article>
  );
}
