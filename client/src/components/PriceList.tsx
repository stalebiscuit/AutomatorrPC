import type { PriceQuote } from '@automatorr/shared';
import { trackClick } from '../lib/session.js';

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
        <p className="no-prices">Prices refresh nightly — none recorded yet.</p>
      </>
    );
  }

  const sorted = [...prices].sort((a, b) => a.price - b.price);
  const lowest = sorted[0]!.price;

  const open = async (q: PriceQuote) => {
    await trackClick({ componentId, store: q.store, url: q.url });
    window.open(q.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <div className="price">
        <span className="pk">Best price</span>
        <span className="pv">{fmt(lowest)}</span>
      </div>
      <div className="sources">
        {sorted.map((q, i) => (
          <button
            key={`${q.store}-${i}`}
            type="button"
            className={`src${q.price === lowest ? ' low' : ''}`}
            onClick={() => void open(q)}
            aria-label={`${q.store} ${fmt(q.price)} — opens in a new tab`}
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
