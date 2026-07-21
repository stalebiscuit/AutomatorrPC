import type { CompareResult, Component } from '@automatorr/shared';
import { summarizeVerdict, trimBrand } from '@automatorr/shared';
import { formatAud } from '../lib/format.js';
import { trackClick } from '../lib/session.js';

/**
 * Verdict summary folded into the comparison: winner vs loser with prices, a
 * deterministic explanation of why the winner wins, the decisive delta tiles and
 * the "best for" tags. The full spec breakdown sits in the cards below.
 */
export function VerdictCard({ result }: { result: CompareResult }) {
  const { a, b, scorecard } = result;
  const winnerIsA = scorecard.winnerSlug === a.slug;
  const winner = winnerIsA ? a : b;
  const loser = winnerIsA ? b : a;
  const summary = summarizeVerdict(result);
  const wq = cheapest(winner);
  const lq = cheapest(loser);

  return (
    <section className="verdict-card" aria-label="Verdict">
      <div className="vc-eyebrow">Verdict</div>

      <div className="vc-versus">
        <div className="vc-side">
          <span className="vc-name">
            {trimBrand(winner.name)} <span className="vc-winner">Winner</span>
          </span>
          {wq && (
            <a
              className="vc-meta vc-meta-win"
              href={wq.url}
              target="_blank"
              rel="noreferrer"
              onClick={() => void trackClick({ componentId: winner.id, store: wq.store, url: wq.url })}
            >
              {formatAud(wq.price)} · {wq.store} ↗
            </a>
          )}
        </div>
        <span className="vc-vs" aria-hidden="true">vs</span>
        <div className="vc-side vc-side-loser">
          <span className="vc-name">{trimBrand(loser.name)}</span>
          {lq && (
            <a
              className="vc-meta"
              href={lq.url}
              target="_blank"
              rel="noreferrer"
              onClick={() => void trackClick({ componentId: loser.id, store: lq.store, url: lq.url })}
            >
              {formatAud(lq.price)} · {lq.store} ↗
            </a>
          )}
        </div>
      </div>

      <p className="vc-prose">{summary}</p>

      {scorecard.deltas.length > 0 && (
        <div className="vc-deltas">
          {scorecard.deltas.map((d) => (
            <div className="vc-tile" key={d.label}>
              <span className="vc-tile-l">{d.label}</span>
              <span className="vc-tile-v">{d.value}</span>
            </div>
          ))}
        </div>
      )}

      {scorecard.tags.length > 0 && (
        <div className="vc-tags">
          {scorecard.tags.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      )}
    </section>
  );
}

/** Cheapest in-stock quote for a component (null when unpriced). */
function cheapest(c: Component): { price: number; store: string; url: string } | null {
  if (!c.prices.length) return null;
  let best = c.prices[0]!;
  for (const q of c.prices) if (q.price < best.price) best = q;
  return { price: best.price, store: best.store, url: best.url };
}
