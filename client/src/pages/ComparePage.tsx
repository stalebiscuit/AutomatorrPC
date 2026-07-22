import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { CompareCategory, CategoryMeta, Component } from '@automatorr/shared';
import { COMPARE_CATEGORIES } from '@automatorr/shared';
import { api } from '../lib/api.js';
import { trackSearch } from '../lib/session.js';
import { useDocumentMeta } from '../lib/meta.js';
import { TopBar } from '../components/TopBar.js';
import { Hero } from '../components/Hero.js';
import { CategoryNav } from '../components/CategoryNav.js';
import { ComponentPicker } from '../components/ComponentPicker.js';
import { CompareResults } from '../components/CompareResults.js';
import { LandingContent } from '../components/landing/LandingContent.js';
import { SiteFooter } from '../components/SiteFooter.js';

const FALLBACK_CATEGORIES: CategoryMeta[] = COMPARE_CATEGORIES.map((id) => ({
  id,
  label: id.toUpperCase(),
  blurb: '',
}));

const SEP = '-vs-';
function parsePair(pair: string | undefined): { a: string; b: string } {
  if (!pair || !pair.includes(SEP)) return { a: '', b: '' };
  const idx = pair.indexOf(SEP);
  return { a: pair.slice(0, idx), b: pair.slice(idx + SEP.length) };
}
function isCategory(v: string | undefined): v is CompareCategory {
  return !!v && (COMPARE_CATEGORIES as readonly string[]).includes(v);
}

export function ComparePage() {
  const { category: catParam, pair } = useParams();
  const navigate = useNavigate();

  const { data: catData } = useQuery({ queryKey: ['categories'], queryFn: api.getCategories });
  const categories = catData?.categories ?? FALLBACK_CATEGORIES;

  const [category, setCategory] = useState<CompareCategory>(isCategory(catParam) ? catParam : 'cpu');
  const initial = parsePair(pair);
  const [slugA, setSlugA] = useState(initial.a);
  const [slugB, setSlugB] = useState(initial.b);

  // Hydrate from URL (deep links + browser back/forward).
  useEffect(() => {
    if (isCategory(catParam)) setCategory(catParam);
    const p = parsePair(pair);
    setSlugA(p.a);
    setSlugB(p.b);
  }, [catParam, pair]);

  // Reflect a full selection into the canonical, shareable URL. Pushed (not
  // replaced) so Back steps through comparisons instead of exiting the site
  // (review fix, client batch).
  useEffect(() => {
    if (slugA && slugB) {
      const target = `/compare/${category}/${slugA}${SEP}${slugB}`;
      if (window.location.pathname !== target) navigate(target);
    }
  }, [category, slugA, slugB, navigate]);

  // Selected component objects (for picker chips), resolved from slugs.
  const selA = useSelected(category, slugA);
  const selB = useSelected(category, slugB);

  const onCategory = (next: CompareCategory) => {
    setCategory(next);
    setSlugA('');
    setSlugB('');
    navigate('/', { replace: true });
  };

  const pick = (side: 'a' | 'b') => (c: Component) => {
    if (side === 'a') setSlugA(c.slug);
    else setSlugB(c.slug);
    trackSearch({ category, componentId: c.id });
  };

  const both = !!slugA && !!slugB;

  // Per-pair titles/descriptions for SEO + shareability (review fix 1.9).
  const pairReady = both && selA && selB;
  useDocumentMeta({
    title: pairReady
      ? `${selA.name} vs ${selB.name} | Speccify`
      : 'Speccify | Compare PC Parts & Build Your Rig',
    description: pairReady
      ? `${selA.name} vs ${selB.name}: full specs side-by-side, benchmark-based performance scores, a clear verdict, and today's best Australian prices.`
      : 'Compare any two PC parts head-to-head with verified specs, benchmark-based scores and live Australian pricing, or plan a full compatibility-checked build and find the cheapest store. Free, independent, updated daily.',
  });

  /** Landing CTA — scroll back up and focus picker A. */
  const pickFirst = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const chip = document.querySelector<HTMLButtonElement>('.selector .picker-chip');
    chip?.focus({ preventScroll: true });
  };

  return (
    <div className="wrap">
      <TopBar />
      <Hero />
      <CategoryNav categories={categories} active={category} onSelect={onCategory} />

      <div className="selector">
        <ComponentPicker
          category={category}
          side="a"
          selected={selA}
          excludeSlug={slugB || undefined}
          onSelect={pick('a')}
        />
        <div className="vs" aria-hidden="true">
          VS
        </div>
        <ComponentPicker
          category={category}
          side="b"
          selected={selB}
          excludeSlug={slugA || undefined}
          onSelect={pick('b')}
        />
      </div>

      {both ? (
        <CompareResults category={category} slugA={slugA} slugB={slugB} />
      ) : (
        <LandingContent hasOne={!!slugA || !!slugB} onPickFirst={pickFirst} />
      )}

      <SiteFooter />
    </div>
  );
}

function useSelected(category: CompareCategory, slug: string): Component | null {
  const { data } = useQuery({
    queryKey: ['component', category, slug],
    queryFn: () => api.getComponent(category, slug),
    enabled: !!slug,
  });
  return data?.component ?? null;
}
