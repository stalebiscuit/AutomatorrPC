import { Link } from 'react-router-dom';
import { Eyebrow } from '../Eyebrow.js';
import { TrustSection } from './TrustSection.js';

/**
 * Integrated landing (launch-polish P2) — fills the empty region of the
 * compare skeleton until a comparison is active, then unmounts entirely.
 * Explains what Speccify is, surfaces the PC Builder, and hosts the trust
 * band. No new route: `/` keeps its SEO equity.
 */

/** Hand-curated "popular right now" pairs — every slug exists in the seed
 *  catalogue. Swap for the /api/trending endpoint in v1.1. */
const POPULAR: Array<{ label: string; to: string }> = [
  { label: '9800X3D vs 14700K', to: '/compare/cpu/amd-ryzen-7-9800x3d-vs-intel-core-i7-14700k' },
  { label: '7800X3D vs 9800X3D', to: '/compare/cpu/amd-ryzen-7-7800x3d-vs-amd-ryzen-7-9800x3d' },
  { label: 'RTX 5090 vs RTX 4090', to: '/compare/gpu/nvidia-geforce-rtx-5090-vs-nvidia-geforce-rtx-4090' },
  { label: 'RX 7900 XTX vs RTX 4080 SUPER', to: '/compare/gpu/amd-radeon-rx-7900-xtx-vs-nvidia-geforce-rtx-4080-super' },
  { label: '7600X vs 12400F', to: '/compare/cpu/amd-ryzen-5-7600x-vs-intel-core-i5-12400f' },
  { label: 'RX 7800 XT vs RTX 4070', to: '/compare/gpu/amd-radeon-rx-7800-xt-vs-nvidia-geforce-rtx-4070' },
];

interface Props {
  /** One part already picked — swap the intro for a "pick the second" nudge. */
  hasOne: boolean;
  /** Scroll/focus picker A (the `PICK YOUR FIRST PART ↑` CTA). */
  onPickFirst: () => void;
}

export function LandingContent({ hasOne, onPickFirst }: Props) {
  return (
    <div className="landing">
      {/* ── 1 · What is this (absorbs the old empty-state card) ── */}
      <section className="landing-intro">
        <Eyebrow>WELCOME TO SPECCIFY</Eyebrow>
        {hasOne ? (
          <>
            <h3>Pick the second part</h3>
            <p className="landing-hint">↑ CHOOSE THE RIVAL TO START THE SHOWDOWN</p>
          </>
        ) : (
          <>
            <h3>Compare any two PC parts. Build your whole rig. Buy it for less.</h3>
            <p>
              Speccify puts verified specs, benchmark-based performance scores and live Australian
              pricing in one place, so you can settle any &ldquo;which is better?&rdquo; debate in
              seconds, then assemble a full, compatibility-checked build and see which store sells
              it cheapest. Free, independent, updated daily.
            </p>
            <p className="landing-hint">↑ PICK A CATEGORY AND TWO PARTS TO START</p>
          </>
        )}
      </section>

      {/* ── 2 · The two tools ── */}
      <section className="landing-tools">
        <article className="landing-tool">
          <span className="landing-kicker">01 / COMPARE</span>
          <h4>Head-to-head, settled.</h4>
          <p>
            Every spec side-by-side with the leader flagged per row, a normalised performance
            score, current prices across Aussie stores, and a clear verdict on which part wins,
            and why.
          </p>
          <button type="button" className="cta outline" onClick={onPickFirst}>
            PICK YOUR FIRST PART ↑
          </button>
        </article>
        <article className="landing-tool">
          <span className="landing-kicker">02 / PC BUILDER</span>
          <h4>A full build, checked and priced.</h4>
          <p>
            Add a part per category with live compatibility checks, a wattage estimate and a build
            score out of 100. Then see which single store sells your whole build cheapest, or the
            best split across stores.
          </p>
          <Link to="/pc-builder" className="cta solid">
            START A BUILD →
          </Link>
        </article>
      </section>

      {/* ── 3 · How it works ── */}
      <section className="landing-steps" aria-label="How it works">
        <div className="landing-step">
          <span className="landing-step-n">01</span>
          <p>Pick a category: CPU to monitor, nine in all.</p>
        </div>
        <div className="landing-step">
          <span className="landing-step-n">02</span>
          <p>Choose two rivals from the full curated catalogue.</p>
        </div>
        <div className="landing-step">
          <span className="landing-step-n">03</span>
          <p>Get the verdict: specs, score, and the best price per store.</p>
        </div>
      </section>

      {/* ── 4 · Popular right now ── */}
      <section className="landing-popular" aria-label="Popular comparisons">
        <span className="landing-kicker">POPULAR RIGHT NOW</span>
        <div className="landing-chips">
          {POPULAR.map((p) => (
            <Link key={p.to} to={p.to} className="landing-chip">
              {p.label}
            </Link>
          ))}
        </div>
      </section>

      {/* ── 5 · Why trust Speccify ── */}
      <TrustSection />
    </div>
  );
}
