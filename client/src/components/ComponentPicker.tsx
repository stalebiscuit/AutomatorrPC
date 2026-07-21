import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CompareCategory, Component } from '@automatorr/shared';
import { api } from '../lib/api.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';

interface Props {
  category: CompareCategory;
  side: 'a' | 'b';
  selected: Component | null;
  excludeSlug?: string;
  onSelect: (component: Component) => void;
}

export function ComponentPicker({ category, side, selected, excludeSlug, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 250);
  const ref = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['components', category, debounced],
    queryFn: () => api.listComponents(category, debounced || undefined),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const options = (data?.components ?? []).filter((c) => c.slug !== excludeSlug);
  const label = side === 'a' ? 'First component' : 'Second component';

  return (
    <div className="picker" ref={ref}>
      <button
        type="button"
        className={`picker-chip ${side}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={selected ? `${label}: ${selected.name}. Change.` : `Choose the ${label.toLowerCase()}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="dot" />
        <span className={`nm${selected ? '' : ' placeholder'}`}>
          {selected ? selected.name : `Choose ${side === 'a' ? 'a part' : 'the rival'}…`}
        </span>
        <span className="ed">{selected ? 'CHANGE' : 'PICK'}</span>
      </button>

      {open && (
        <div className="picker-pop" role="dialog" aria-label={label}>
          <input
            className="picker-search"
            type="text"
            autoFocus
            placeholder={`Search ${category.toUpperCase()}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={`Search ${category} components`}
          />
          <div className="picker-list" role="listbox">
            {isLoading && <div className="picker-empty">Searching…</div>}
            {!isLoading && options.length === 0 && (
              <div className="picker-empty">No matches.</div>
            )}
            {options.map((c) => (
              <button
                key={c.slug}
                type="button"
                role="option"
                aria-selected={c.slug === selected?.slug}
                className="picker-opt"
                onClick={() => {
                  onSelect(c);
                  setOpen(false);
                  setQuery('');
                }}
              >
                <span>{c.name}</span>
                <span className="pi">{c.performanceIndex.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
