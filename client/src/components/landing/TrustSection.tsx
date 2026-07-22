import { Link } from 'react-router-dom';
import { Eyebrow } from '../Eyebrow.js';

/**
 * Trust / verification band (launch-polish P3) — founder note + proof chips +
 * affiliate disclosure microcopy. Process claims only ("refreshed daily"),
 * never absolutes ("always accurate") — the legal pages carry the caveats.
 */
export function TrustSection() {
  return (
    <section className="trust" aria-label="Why trust Speccify">
      <div className="trust-note">
        <Eyebrow>WHY TRUST SPECCIFY</Eyebrow>
        <h4>Built by an enthusiast, not a marketing team.</h4>
        <p>
          I&rsquo;ve personally built more than fifty PCs for myself, family, friends, and my own
          personal customers and clients. Every build meant juggling benchmark sites, part-picker tools and a
          dozen retailer tabs. Speccify is the one place I always wanted: verified specs, honest
          head-to-head verdicts, and live Aussie pricing for every part, refreshed every day,
          direct from the stores that sell them.
        </p>
        <Link to="/about" className="trust-more">
          more about how this works →
        </Link>
      </div>
      <div className="trust-chips">
        <div className="trust-chip">
          <span className="trust-chip-k">UPDATED DAILY</span>
          <p>Prices re-scraped from Australian retailers every morning; every price shows when it was last checked.</p>
        </div>
        <div className="trust-chip">
          <span className="trust-chip-k">VERIFIED SPECS</span>
          <p>Curated from manufacturer datasheets and audited for duplicates and errors before they&rsquo;re published.</p>
        </div>
        <div className="trust-chip">
          <span className="trust-chip-k">DETERMINISTIC VERDICTS</span>
          <p>Scores come from a published formula, not opinion. The same two parts always produce the same verdict.</p>
        </div>
      </div>
      <p className="trust-disclosure">
        Speccify earns affiliate commission on some outbound links. Commissions never influence
        scores, rankings or verdicts. <Link to="/legal/disclosure">Disclosure</Link>
      </p>
    </section>
  );
}
