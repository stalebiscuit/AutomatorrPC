export function CompareSkeleton() {
  return (
    <div className="grid" aria-busy="true" aria-label="Loading comparison">
      <div className="shimmer sk-card" />
      <div className="spine" aria-hidden="true">
        <div className="node">→</div>
      </div>
      <div className="shimmer sk-card" />
    </div>
  );
}

export function ProseSkeleton() {
  return (
    <div aria-busy="true">
      <div className="shimmer sk-line" style={{ width: '90%' }} />
      <div className="shimmer sk-line" style={{ width: '96%' }} />
      <div className="shimmer sk-line" style={{ width: '80%' }} />
    </div>
  );
}
