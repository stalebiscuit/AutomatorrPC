import { Link } from 'react-router-dom';
import { TopBar } from '../components/TopBar.js';
import { SiteFooter } from '../components/SiteFooter.js';
import { Eyebrow } from '../components/Eyebrow.js';
import { useDocumentMeta } from '../lib/meta.js';

/** 404 catch-all (review fix, client batch) — unknown URLs used to render blank. */
export function NotFoundPage() {
  useDocumentMeta({ title: 'Page not found | Speccify' });

  return (
    <div className="wrap">
      <TopBar />
      <div className="landing-intro notfound">
        <Eyebrow>404 / NOT FOUND</Eyebrow>
        <h3>That page doesn&rsquo;t exist.</h3>
        <p>
          The link may be wrong, or the page has moved. Head back to the comparison tool or start a
          build instead.
        </p>
        <div className="notfound-actions">
          <Link to="/" className="cta solid">
            COMPARE PARTS →
          </Link>
          <Link to="/pc-builder" className="cta outline">
            PC BUILDER →
          </Link>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
