import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { TopBar } from '../components/TopBar.js';
import { SiteFooter } from '../components/SiteFooter.js';
import { LEGAL_DOCS, isLegalSlug } from '../legal/content.js';

/** Renders one of the four legal documents at /legal/:doc (launch-polish P1). */
export function LegalPage() {
  const { doc } = useParams();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [doc]);

  if (!isLegalSlug(doc)) return <Navigate to="/legal/terms" replace />;
  const { title, body } = LEGAL_DOCS[doc];

  return (
    <div className="wrap">
      <TopBar />
      <article className="legal-page">
        <nav className="legal-tabs" aria-label="Legal documents">
          {(Object.keys(LEGAL_DOCS) as Array<keyof typeof LEGAL_DOCS>).map((slug) => (
            <Link
              key={slug}
              to={`/legal/${slug}`}
              className={slug === doc ? 'on' : ''}
              aria-current={slug === doc ? 'page' : undefined}
            >
              {LEGAL_DOCS[slug].title}
            </Link>
          ))}
        </nav>
        <h1>{title}</h1>
        {body}
      </article>
      <SiteFooter />
    </div>
  );
}
