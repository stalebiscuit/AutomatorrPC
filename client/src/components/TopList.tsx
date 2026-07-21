import type { CountKey } from '@automatorr/shared';

export function TopList({ items, empty }: { items: CountKey[]; empty: string }) {
  if (items.length === 0) {
    return <p style={{ color: 'var(--muted-2)', fontSize: 13 }}>{empty}</p>;
  }
  return (
    <ol className="toplist">
      {items.map((it, i) => (
        <li key={it.key}>
          <span className="rank">{`1.${i}`}</span>
          <span className="nm">{it.label}</span>
          <span className="ct">{it.count.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}
