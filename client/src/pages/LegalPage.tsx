import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { TopBar } from '../components/TopBar.js';
import { SiteFooter } from '../components/SiteFooter.js';
import { LEGAL_DOCS, isLegalSlug } from '../legal/content.js';
import { useDocumentMeta } from '../lib/meta.js';

/** Renders one of the four legal documents at /legal/:doc (launch-polish P1). */
export function LegalPage() {
  const { doc } = useParams();
  const slug = isLegalSlug(doc) ? doc : 'terms';
  const { title, body } = LEGAL_DOCS[slug];

  useDocumentMeta({ title: `${title} | Speccify`, canonicalPath: `/legal/${slug}` });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [doc]);

  if (!isLegalSlug(doc)) return <Navigate to="/legal/terms" replace />;

  return (
    <div className="wrap">
      <TopBar />
      <article className="legal-page">
        <nav className="legal-tabs" aria-label="Legal documents">
          {(Object.keys(LEGAL_DOCS) as Array<keyof typeof LEGAL_DOCS>).map((s) => (
            <Link
              key={s}
              to={`/legal/${s}`}
              className={s === slug ? 'on' : ''}
              aria-current={s === slug ? 'page' : undefined}
            >
              {LEGAL_DOCS[s].title}
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
