import type { MerchantTotal } from '@automatorr/shared';
import { formatAud } from '../../lib/format.js';

/** Per-merchant single-store totals + difference vs cheapest (PCPP by-merchant). */
export function PricesByMerchant({ merchants }: { merchants: MerchantTotal[] }) {
  if (!merchants.length) return <p className="muted">Add priced parts to compare merchants.</p>;
  return (
    <>
      <p className="merchant-caption muted">
        Buy the whole build from one store — one shipping fee and one point of contact for
        returns, versus the cheapest split cart in the Overview tab.
      </p>
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
          <tr key={m.store}>
            <td>{m.store}</td>
            <td className="tabnum">
              {m.availableCount}/{m.totalParts}
            </td>
            <td className="tabnum">{formatAud(m.total)}</td>
            <td className="tabnum">{m.difference === 0 ? 'Cheapest' : `+${formatAud(m.difference)}`}</td>
          </tr>
        ))}
      </tbody>
      </table>
    </>
  );
}
