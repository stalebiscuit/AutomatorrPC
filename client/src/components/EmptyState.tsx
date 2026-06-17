export function EmptyState({ hasOne }: { hasOne: boolean }) {
  return (
    <div className="empty">
      <h3>{hasOne ? 'Pick the second part' : 'Choose two parts to compare'}</h3>
      <p>
        {hasOne
          ? 'Select a rival above and the head-to-head runs automatically.'
          : 'Pick a category, then fill both slots — the comparison runs the instant they’re set.'}
      </p>
    </div>
  );
}
