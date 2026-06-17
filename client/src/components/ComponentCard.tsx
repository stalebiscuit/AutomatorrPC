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
        {component.imageUrl ? (
          <img src={component.imageUrl} alt={component.name} loading="lazy" />
        ) : (
          <CategoryRender category={component.category} win={win} />
        )}
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
