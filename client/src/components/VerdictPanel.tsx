import type { CompareResult, VerdictResponse } from '@automatorr/shared';
import { SectionHead } from './Eyebrow.js';
import { ProseSkeleton } from './Skeletons.js';

interface Props {
  result: CompareResult;
  verdict?: VerdictResponse;
  loadingVerdict: boolean;
}

export function VerdictPanel({ result, verdict, loadingVerdict }: Props) {
  const { a, b, scorecard } = result;
  const winnerIsA = scorecard.winnerSlug === a.slug;
  const winner = winnerIsA ? a : b;
  const loser = winnerIsA ? b : a;
  const winnerCount = winnerIsA ? scorecard.tally.a : scorecard.tally.b;
  const loserCount = winnerIsA ? scorecard.tally.b : scorecard.tally.a;
  const total = scorecard.tally.total;
  const barPct = total > 0 ? Math.round((winnerCount / total) * 100) : 50;

  return (
    <section className="verdict" aria-label="The verdict">
      <SectionHead index="03" label="THE VERDICT" />
      <div className="vgrid">
        <div className="vmain">
          <h3>
            Why the {shortName(winner.name)} {scorecard.crossSubtype ? 'leads' : 'outclasses'} the{' '}
            {shortName(loser.name)}
          </h3>
          {loadingVerdict ? (
            <ProseSkeleton />
          ) : (
            <p className="vbody">{verdict?.prose}</p>
          )}
          {verdict && !verdict.generated && (
            <span className="ai-pill">AI verdict — coming soon</span>
          )}
        </div>

        <aside className="scorecard" aria-label="Winner scorecard">
          <div className="sc-title">Winner scorecard</div>
          <div className="tally-head">
            <span className="lead">
              <b>{winner.brand}</b> {winnerCount}
            </span>
            <span className="trail">
              {loser.brand} {loserCount}
            </span>
          </div>
          <div className="bar" role="img" aria-label={`${winner.brand} won ${winnerCount} of ${total} spec categories`}>
            <i style={{ width: `${barPct}%` }} />
          </div>
          <div className="tally-cap">SPEC CATEGORIES WON</div>

          {scorecard.deltas.length > 0 && (
            <div className="deltas">
              {scorecard.deltas.map((d) => (
                <div className="delta" key={d.label}>
                  <span className="dv">{d.value}</span>
                  <span className="dk">{d.label}</span>
                </div>
              ))}
            </div>
          )}

          {scorecard.tags.length > 0 && (
            <div className="vtags">
              {scorecard.tags.map((t) => (
                <span key={t}>{t.toUpperCase()}</span>
              ))}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

/** Trim a leading brand word for a tighter headline (e.g. "Intel Core i9…" → "Core i9…"). */
function shortName(name: string): string {
  return name.replace(/^(Intel|AMD|NVIDIA|Samsung|Corsair|G\.SKILL|Kingston|Crucial|Seagate|WD)\s+/i, '');
}
