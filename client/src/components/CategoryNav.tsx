import type { Category, CategoryMeta } from '@automatorr/shared';

interface Props {
  categories: CategoryMeta[];
  active: Category;
  onSelect: (category: Category) => void;
}

/** Four category pills; CPU active by default (spec §3). */
export function CategoryNav({ categories, active, onSelect }: Props) {
  return (
    <nav className="cats" aria-label="Component category">
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`cat${c.id === active ? ' active' : ''}`}
          aria-pressed={c.id === active}
          title={c.blurb}
          onClick={() => onSelect(c.id)}
        >
          {c.label.toUpperCase()}
        </button>
      ))}
    </nav>
  );
}
