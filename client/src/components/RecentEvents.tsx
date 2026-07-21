import type { RecentEvent } from '@automatorr/shared';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function RecentEvents({ events }: { events: RecentEvent[] }) {
  if (events.length === 0) {
    return <p style={{ color: 'var(--muted-2)', fontSize: 13 }}>No events captured yet.</p>;
  }
  return (
    <table className="events">
      <thead>
        <tr>
          <th>Type</th>
          <th>Event</th>
          <th>Detail</th>
          <th>When</th>
        </tr>
      </thead>
      <tbody>
        {events.map((e, i) => (
          <tr key={`${e.ts}-${i}`}>
            <td>
              <span className={`kind ${e.kind}`}>{e.kind}</span>
            </td>
            <td>{e.label}</td>
            <td className="detail" title={e.detail}>
              {e.detail}
            </td>
            <td>{timeAgo(e.ts)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
