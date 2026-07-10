import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { Category, CategoryMeta, Component } from '@automatorr/shared';
import { CATEGORIES } from '@automatorr/shared';
import { api } from '../lib/api.js';
import { trackSearch } from '../lib/session.js';
import { TopBar } from '../components/TopBar.js';
import { Hero } from '../components/Hero.js';
import { CategoryNav } from '../components/CategoryNav.js';
import { ComponentPicker } from '../components/ComponentPicker.js';
import { EmptyState } from '../components/EmptyState.js';
import { CompareResults } from '../components/CompareResults.js';

const FALLBACK_CATEGORIES: CategoryMeta[] = CATEGORIES.map((id) => ({
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
function isCategory(v: string | undefined): v is Category {
  return !!v && (CATEGORIES as readonly string[]).includes(v);
}

export function ComparePage() {
  const { category: catParam, pair } = useParams();
  const navigate = useNavigate();

  const { data: catData } = useQuery({ queryKey: ['categories'], queryFn: api.getCategories });
  const categories = catData?.categories ?? FALLBACK_CATEGORIES;

  const [category, setCategory] = useState<Category>(isCategory(catParam) ? catParam : 'cpu');
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

  // Reflect a full selection into the canonical, shareable URL.
  useEffect(() => {
    if (slugA && slugB) {
      const target = `/compare/${category}/${slugA}${SEP}${slugB}`;
      if (window.location.pathname !== target) navigate(target, { replace: true });
    }
  }, [category, slugA, slugB, navigate]);

  // Selected component objects (for picker chips), resolved from slugs.
  const selA = useSelected(category, slugA);
  const selB = useSelected(category, slugB);

  const onCategory = (next: Category) => {
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
        <EmptyState hasOne={!!slugA || !!slugB} />
      )}

      <div className="foot foot-clean">
        <span>© 2026 Automatorr</span>
      </div>
    </div>
  );
}

function useSelected(category: Category, slug: string): Component | null {
  const { data } = useQuery({
    queryKey: ['component', category, slug],
    queryFn: () => api.getComponent(category, slug),
    enabled: !!slug,
  });
  return data?.component ?? null;
}
