import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '../components/TopBar.js';
import { SiteFooter } from '../components/SiteFooter.js';
import { Eyebrow } from '../components/Eyebrow.js';
import { openFeedback } from '../lib/feedback.js';

/** About page (launch-polish P3) — founder story + how the data works. */
export function AboutPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="wrap">
      <TopBar />
      <article className="legal-page about-page">
        <Eyebrow>ABOUT SPECCIFY</Eyebrow>
        <h1>Built by an enthusiast, not a marketing team.</h1>

        <p>
          I&rsquo;ve personally built more than fifty PCs for myself, family, friends, and my own
          personal customers and clients. Every one of those builds meant the same routine: a benchmark site in
          one tab, a part-picker in another, and a dozen retailer tabs fighting for the best price.
          The data lived everywhere and agreed nowhere.
        </p>
        <p>
          Speccify is the one place I always wanted: verified specs, honest head-to-head verdicts,
          full-build compatibility checks, and live Australian pricing: all together, all
          refreshed daily.
        </p>

        <h2>How our data works</h2>
        <p>
          <strong>Specs</strong> are curated from manufacturer datasheets and structured product
          data, then audited for duplicates, naming errors and gaps before they&rsquo;re published.
        </p>
        <p>
          <strong>Performance scores</strong> are computed by a deterministic formula from published
          benchmark data and normalised within each category, so any two parts can be compared on
          the same scale. The same two parts always produce the same verdict. No opinions, no
          sponsorships.
        </p>
        <p>
          <strong>Prices</strong> are re-collected from Australian retailers every morning, listed
          lowest-first, and each price shows when it was last checked.
        </p>
        <p>
          <strong>Mistakes</strong> happen; hardware data is messy. When you spot one,{' '}
          <button type="button" className="link-btn" onClick={() => openFeedback()}>
            tell us
          </button>{' '}
          and we&rsquo;ll fix it promptly. The full caveats live in our{' '}
          <Link to="/legal/disclaimer">Disclaimer</Link>.
        </p>

        <h2>How Speccify stays free</h2>
        <p>
          Some outbound links are affiliate links: buy through them and we may earn a commission at
          no extra cost to you. Commissions never influence scores, rankings or verdicts; the
          formula doesn&rsquo;t know who pays us. Details in our{' '}
          <Link to="/legal/disclosure">Affiliate Disclosure</Link>.
        </p>
      </article>
      <SiteFooter />
    </div>
  );
}
