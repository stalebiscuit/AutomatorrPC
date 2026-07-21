import { useState } from 'react';
import type { BuilderCategory } from '@automatorr/shared';
import { CategoryRender } from './CategoryRender.js';

/**
 * One thumbnail component for every surface (compare card, part picker, build table).
 * Real image → on error, try the same-name .svg → then fall back to the per-category
 * Automatorr render. Guarantees a clean, on-brand thumb even when a part has no photo,
 * so the catalogue never shows blank/broken/text placeholders.
 *
 * `className` styles the box; the inner <img>/<svg> fills it (see .thumb-fill CSS).
 */
export function Thumb({
  imageUrl,
  category,
  name,
  win = false,
  className,
}: {
  imageUrl?: string | null;
  category: BuilderCategory;
  name?: string;
  win?: boolean;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(imageUrl ?? null);
  const [broken, setBroken] = useState(false);
  const box = `thumb-fill${className ? ` ${className}` : ''}`;

  if (!src || broken) {
    return (
      <span className={box}>
        <CategoryRender category={category} win={win} />
      </span>
    );
  }
  return (
    <span className={box}>
      <img
        src={src}
        alt={name ?? ''}
        loading="lazy"
        onError={() => {
          const fallback = src.replace(/\.(png|jpe?g|webp)$/i, '.svg');
          if (fallback !== src) setSrc(fallback);
          else setBroken(true);
        }}
      />
    </span>
  );
}
