import { useState } from 'react';
import type { BuilderCategory, Specs } from '@automatorr/shared';
import { CategoryRender } from './CategoryRender.js';
import { conceptAsset } from '../lib/partImage.js';

/**
 * One thumbnail for every surface (compare card, part picker, build table). Tries the product
 * photo, then a local concept render (brand logo for CPU/GPU, DDR5 / drive render for RAM/storage),
 * then the per-category wireframe — so the catalogue never shows a blank/broken/text placeholder.
 *
 * `className` styles the box; the inner <img>/<svg> fills it (see .thumb-fill CSS).
 */
export function Thumb({
  imageUrl,
  category,
  name,
  win = false,
  className,
  brand = '',
  specs,
}: {
  imageUrl?: string | null;
  category: BuilderCategory;
  name?: string;
  win?: boolean;
  className?: string;
  brand?: string;
  specs?: Specs;
}) {
  const candidates = [imageUrl || null, conceptAsset(category, brand, name ?? '', specs)].filter(
    (x): x is string => !!x,
  );
  const [idx, setIdx] = useState(0);
  const box = `thumb-fill${className ? ` ${className}` : ''}`;
  const src = candidates[idx];
  if (!src) {
    return (
      <span className={box}>
        <CategoryRender category={category} win={win} />
      </span>
    );
  }
  return (
    <span className={box}>
      <img src={src} alt={name ?? ''} loading="lazy" onError={() => setIdx((i) => i + 1)} />
    </span>
  );
}
