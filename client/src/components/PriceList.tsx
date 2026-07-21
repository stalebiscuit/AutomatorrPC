import type { PriceQuote } from '@automatorr/shared';
import { trackClick } from '../lib/session.js';
import { freshness } from '../lib/format.js';

interface Props {
  componentId: string;
  prices: PriceQuote[];
}

function fmt(price: number): string {
  return `$${price.toLocaleString('en-AU')}`;
}

export function PriceList({ componentId, prices }: Props) {
  if (prices.length === 0) {
    return (
      <>
        <div className="price">
          <span className="pk">Best price</span>
          <span className="pv">—</span>
        </div>
        <p className="no-prices">Prices refresh nightly. None recorded yet.</p>
      </>
    );
  }

  const sorted = [...prices].sort((a, b) => a.price - b.price);
  const lowest = sorted[0]!.price;
  // Freshest lastUpdated across quotes — a visible, self-verifying claim.
  const newest = sorted.reduce<string | null>(
    (acc, q) => (!acc || (q.lastUpdated && q.lastUpdated > acc) ? q.lastUpdated || acc : acc),
    null,
  );
  const fresh = freshness(newest);

  const open = async (q: PriceQuote) => {
    await trackClick({ componentId, store: q.store, url: q.url });
    window.open(q.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <div className="price">
        <span className="pk">
          Best price
          {fresh && <span className="fresh-badge">{fresh}</span>}
        </span>
        <span className="pv">{fmt(lowest)}</span>
      </div>
      <div className="sources">
        {sorted.map((q, i) => (
          <button
            key={`${q.store}-${i}`}
            type="button"
            className={`src${q.price === lowest ? ' low' : ''}`}
            onClick={() => void open(q)}
            aria-label={`${q.store} ${fmt(q.price)}, opens in a new tab`}
          >
            <span className="si">{`1.${i}`}</span>
            <span className="store">{q.store}</span>
            <span className="sp">{fmt(q.price)}</span>
            <span className="ar" aria-hidden="true">
              ↗
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
