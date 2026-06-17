import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Category, CategoryMeta } from '@automatorr/shared';
import { CATEGORIES } from '@automatorr/shared';
import { api } from '../lib/api.js';
import { TopBar } from '../components/TopBar.js';
import { Hero } from '../components/Hero.js';
import { CategoryNav } from '../components/CategoryNav.js';

const FALLBACK_CATEGORIES: CategoryMeta[] = CATEGORIES.map((id) => ({
  id,
  label: id.toUpperCase(),
  blurb: '',
}));

export function ComparePage() {
  const { data } = useQuery({
    queryKey: ['categories'],
    queryFn: api.getCategories,
  });
  const categories = data?.categories ?? FALLBACK_CATEGORIES;
  const [active, setActive] = useState<Category>('cpu');

  return (
    <div className="wrap">
      <TopBar />
      <Hero />
      <CategoryNav categories={categories} active={active} onSelect={setActive} />

      <div className="foot">
        <span>V5 // VERDICT SCORECARD · BRANDED COMPONENT RENDER</span>
        <span>NEAR-BLACK BASE · LIME KEYLINES · KANIT + INTER · MONO INDICES</span>
      </div>
    </div>
  );
}
