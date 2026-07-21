import { useQuery } from '@tanstack/react-query';
import type { AnalyticsWindow } from '@automatorr/shared';
import { api } from '../lib/api.js';
import { SectionHead } from './Eyebrow.js';
import { TrendChart } from './TrendChart.js';
import { TopList } from './TopList.js';
import { formatAud } from '../lib/format.js';

/** Second dashboard view: analytics derived from saved PC Builder builds (Task 3.4). */
export function BuilderDashboard({ window }: { window: AnalyticsWindow }) {
  const q = useQuery({
    queryKey: ['builder-analytics', window],
    queryFn: () => api.builderAnalytics(window),
    retry: false,
  });

  if (q.isLoading) return <div className="state">Loading builder analytics…</div>;
  if (q.isError || !q.data) return <div className="state error">Could not load builder analytics.</div>;
  const a = q.data;

  return (
    <>
      <div className="kpis">
        <div className="kpi">
          <div className="kv">{a.totals.builds.toLocaleString()}</div>
          <div className="kl">Builds created</div>
        </div>
        <div className="kpi">
          <div className="kv">{a.averages.score}/100</div>
          <div className="kl">Avg build score</div>
        </div>
        <div className="kpi">
          <div className="kv">{a.averages.budget !== null ? formatAud(a.averages.budget) : '—'}</div>
          <div className="kl">Avg budget</div>
        </div>
        <div className="kpi">
          <div className="kv">{Math.round(a.completionRate * 100)}%</div>
          <div className="kl">Complete builds</div>
        </div>
      </div>

      <div className="panel-grid panel-grid--wide-chart">
        <div className="panel">
          <h2>Builds over time</h2>
          <TrendChart data={a.buildsOverTime} />
        </div>
        <div className="panel">
          <h2>Most-used parts</h2>
          <TopList items={a.topParts} empty="No parts in builds yet." />
        </div>
      </div>

      <div className="panel-grid">
        <div className="panel">
          <h2>Category usage</h2>
          <TopList items={a.categoryUsage} empty="No builds yet." />
        </div>
        <div className="panel">
          <SectionHead index="•" label="AVERAGES" />
          <ul className="stat-list">
            <li>
              <span>Avg estimated wattage</span>
              <span className="tabnum">{a.averages.wattage} W</span>
            </li>
            <li>
              <span>Avg build total</span>
              <span className="tabnum">{formatAud(a.averages.total)}</span>
            </li>
            <li>
              <span>Builds with a budget set</span>
              <span className="tabnum">
                {a.totals.withBudget}/{a.totals.builds}
              </span>
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}
