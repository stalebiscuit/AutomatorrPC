export function EmptyState({ hasOne }: { hasOne: boolean }) {
  return (
    <div className="empty">
      <h3>{hasOne ? 'Pick the second part' : 'Choose two parts to compare'}</h3>
      <p>
        {hasOne
          ? ''
          : ''}
      </p>
    </div>
  );
}
