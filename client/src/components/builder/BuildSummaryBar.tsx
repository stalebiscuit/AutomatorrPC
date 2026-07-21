import type { BuildScoreResult, WattageEstimate } from '@automatorr/shared';
import { formatAud } from '../../lib/format.js';

interface Props {
  total: number;
  wattage: WattageEstimate;
  score: BuildScoreResult;
  /** target budget (AUD); when the total exceeds it the total is flagged */
  budget?: number;
}

/** Header strip: running total, estimated wattage + PSU rec, and the /100 score. */
export function BuildSummaryBar({ total, wattage, score, budget }: Props) {
  const overBudget = budget !== undefined && budget > 0 && total > budget;
  return (
    <div className="summary-bar">
      <div className="summary-cell">
        <span className="summary-label">Total</span>
        <span className={overBudget ? 'summary-value tabnum over-budget' : 'summary-value tabnum'}>
          {formatAud(total)}
        </span>
        {overBudget && (
          <span className="summary-sub over-budget">Over by {formatAud(total - (budget as number))}</span>
        )}
      </div>
      <div className="summary-cell">
        <span className="summary-label">Est. wattage</span>
        <span className="summary-value tabnum">{wattage.estimatedWatts} W</span>
        <span className="summary-sub">PSU ≥ {wattage.recommendedPsuWatts} W</span>
      </div>
      <div className="summary-cell">
        <span className="summary-label">Build score</span>
        <span className="summary-value tabnum">{score.score}/100</span>
        <span className="summary-sub" title={score.notes.join(' ')}>
          {score.notes.length ? score.notes[0] : 'Looking good'}
        </span>
      </div>
    </div>
  );
}
