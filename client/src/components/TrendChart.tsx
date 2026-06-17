import type { TimeBucket } from '@automatorr/shared';

/**
 * Search-volume bar chart. Accessible per spec §4 chart rules: legend, a
 * visually-hidden data table fallback, colourblind-safe single-hue bars, and
 * per-bar titles (tooltips). Honours reduced-motion via the global rule.
 */
export function TrendChart({ data }: { data: TimeBucket[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <figure style={{ margin: 0 }}>
      <figcaption className="visually-hidden">Search volume over time</figcaption>
      {data.length === 0 ? (
        <p style={{ color: 'var(--muted-2)', fontSize: 13 }}>No searches in this window yet.</p>
      ) : (
        <>
          <div className="chart" role="img" aria-label="Search volume bar chart">
            {data.map((d) => (
              <div className="col" key={d.date} title={`${d.date}: ${d.count} searches`}>
                <div
                  className="bar-fill"
                  style={{ height: `${Math.round((d.count / max) * 100)}%` }}
                />
                <span className="bar-x">{d.date.slice(5)}</span>
              </div>
            ))}
          </div>
          <div className="chart-legend">
            <span className="swatch" /> Searches per day
          </div>
          <table className="visually-hidden">
            <caption>Search volume per day</caption>
            <thead>
              <tr>
                <th>Date</th>
                <th>Searches</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  <td>{d.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </figure>
  );
}
