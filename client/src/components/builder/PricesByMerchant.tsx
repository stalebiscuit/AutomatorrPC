import type { MerchantTotal } from '@automatorr/shared';
import { formatAud } from '../../lib/format.js';

/** Per-merchant totals: the cost of the parts each store actually stocks. Stores that stock the
 *  whole build are single-store checkouts, ranked by difference-vs-cheapest (PCPP by-merchant). */
export function PricesByMerchant({ merchants }: { merchants: MerchantTotal[] }) {
  if (!merchants.length) return <p className="muted">Add priced parts to compare merchants.</p>;
  const anyComplete = merchants.some((m) => m.complete);
  const totalParts = merchants[0]?.totalParts ?? 0;
  return (
    <>
      <p className="merchant-caption muted">
        The cost of the parts each store stocks. A store that stocks every part lets you buy the
        whole build in one order — one shipping fee, one point of contact for returns — ranked
        against the cheapest split cart in the Overview tab.
      </p>
      {!anyComplete && (
        <p className="merchant-caption muted">
          No single store stocks all {totalParts} parts yet, so none can fulfil the whole build on
          its own — see the Overview tab for the cheapest split cart.
        </p>
      )}
      <table className="merchant-table">
        <thead>
          <tr>
            <th>Merchant</th>
            <th>Parts</th>
            <th>Total</th>
            <th>Difference</th>
          </tr>
        </thead>
        <tbody>
          {merchants.map((m) => (
            <tr key={m.store} className={m.complete ? 'merchant-row complete' : 'merchant-row'}>
              <td>{m.store}</td>
              <td className="tabnum">
                {m.availableCount}/{m.totalParts}
              </td>
              <td className="tabnum">{formatAud(m.total)}</td>
              <td className="tabnum">
                {!m.complete ? (
                  <span
                    className="muted"
                    title="This store doesn't stock every part, so it can't fulfil the whole build on its own."
                  >
                    —
                  </span>
                ) : m.difference === 0 ? (
                  'Cheapest'
                ) : (
                  `+${formatAud(m.difference ?? 0)}`
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
