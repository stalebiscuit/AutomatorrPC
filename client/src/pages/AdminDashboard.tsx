import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { AnalyticsWindow } from '@automatorr/shared';
import { api, ApiClientError } from '../lib/api.js';
import { TopBar } from '../components/TopBar.js';
import { SectionHead } from '../components/Eyebrow.js';
import { TrendChart } from '../components/TrendChart.js';
import { TopList } from '../components/TopList.js';
import { RecentEvents } from '../components/RecentEvents.js';

const WINDOWS: AnalyticsWindow[] = ['day', 'week', 'month'];

export function AdminDashboard() {
  const navigate = useNavigate();
  const [window, setWindow] = useState<AnalyticsWindow>('week');

  const analyticsQ = useQuery({
    queryKey: ['analytics', window],
    queryFn: () => api.analytics(window),
    retry: false,
  });

  // Guard: a 401 from the analytics endpoint means no session → login.
  useEffect(() => {
    if (analyticsQ.error instanceof ApiClientError && analyticsQ.error.status === 401) {
      navigate('/admin/login', { replace: true });
    }
  }, [analyticsQ.error, navigate]);

  const onLogout = async () => {
    await api.adminLogout().catch(() => undefined);
    navigate('/admin/login', { replace: true });
  };

  const a = analyticsQ.data;

  return (
    <div className="wrap">
      <TopBar />
      <div className="admin-head">
        <h1 className="admin-title">Analytics</h1>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div className="win-toggle" role="group" aria-label="Time window">
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                className={w === window ? 'on' : ''}
                aria-pressed={w === window}
                onClick={() => setWindow(w)}
              >
                {w}
              </button>
            ))}
          </div>
          <button type="button" className="admin-link" onClick={() => void onLogout()}>
            SIGN OUT
          </button>
        </div>
      </div>

      {analyticsQ.isLoading && <div className="state">Loading analytics…</div>}
      {analyticsQ.isError && !(analyticsQ.error instanceof ApiClientError && analyticsQ.error.status === 401) && (
        <div className="state error" role="alert">
          Could not load analytics.
        </div>
      )}

      {a && (
        <>
          <div className="kpis">
            <div className="kpi">
              <div className="kv">{a.totals.searches.toLocaleString()}</div>
              <div className="kl">Searches</div>
            </div>
            <div className="kpi">
              <div className="kv">{a.totals.views.toLocaleString()}</div>
              <div className="kl">Comparisons viewed</div>
            </div>
            <div className="kpi">
              <div className="kv">{a.totals.clicks.toLocaleString()}</div>
              <div className="kl">Price-link clicks</div>
            </div>
          </div>

          <div className="panel-grid panel-grid--wide-chart">
            <div className="panel">
              <h2>Search volume</h2>
              <TrendChart data={a.searchVolume} />
            </div>
            <div className="panel">
              <h2>Top stores by clicks</h2>
              <TopList items={a.topStores} empty="No clicks yet." />
            </div>
          </div>

          <div className="panel-grid">
            <div className="panel">
              <h2>Trending components</h2>
              <TopList items={a.topComponents} empty="No component picks yet." />
            </div>
            <div className="panel">
              <h2>Top comparisons</h2>
              <TopList items={a.topComparisons} empty="No comparisons yet." />
            </div>
          </div>

          <div className="panel">
            <SectionHead index="04" label="RECENT EVENTS" />
            <RecentEvents events={a.recentEvents} />
          </div>
        </>
      )}
    </div>
  );
}
