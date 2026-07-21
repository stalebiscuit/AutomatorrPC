import { useState } from 'react';
import type { StoreStat } from '@automatorr/shared';

type Metric = 'clicks' | 'conversions' | 'rate';

/** Top stores panel with a clicks | conversions | conversion-rate toggle (Task 3.1). */
export function StoreStats({ stats }: { stats: StoreStat[] }) {
  const [metric, setMetric] = useState<Metric>('clicks');
  if (stats.length === 0) return <p className="muted-note">No clicks yet.</p>;

  const sorted = [...stats].sort((a, b) => {
    if (metric === 'conversions') return b.conversions - a.conversions;
    if (metric === 'rate') return b.conversionRate - a.conversionRate;
    return b.clicks - a.clicks;
  });

  const value = (s: StoreStat): string => {
    if (metric === 'conversions') return s.conversions.toLocaleString();
    if (metric === 'rate') return `${(s.conversionRate * 100).toFixed(1)}%`;
    return s.clicks.toLocaleString();
  };

  return (
    <>
      <div className="metric-toggle" role="group" aria-label="Store metric">
        {(['clicks', 'conversions', 'rate'] as Metric[]).map((m) => (
          <button
            key={m}
            type="button"
            className={m === metric ? 'on' : ''}
            aria-pressed={m === metric}
            onClick={() => setMetric(m)}
          >
            {m === 'rate' ? 'conv. rate' : m}
          </button>
        ))}
      </div>
      <ol className="toplist">
        {sorted.map((s, i) => (
          <li key={s.store}>
            <span className="rank">{`1.${i}`}</span>
            <span className="nm">{s.store}</span>
            <span className="ct">{value(s)}</span>
          </li>
        ))}
      </ol>
    </>
  );
}
