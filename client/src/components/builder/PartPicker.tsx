import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BuilderCategory, Component, PartSort } from '@automatorr/shared';
import { Thumb } from '../Thumb.js';
import { bestPrice, BUILDER_CATEGORY_META } from '@automatorr/shared';
import { api } from '../../lib/api.js';
import { formatAud, specSummary } from '../../lib/format.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';

const SPEC_KEYS: Record<BuilderCategory, string[]> = {
  cpu: ['socket', 'cores', 'tdp'],
  cooler: ['type', 'height', 'color', 'socketSupport'],
  motherboard: ['socket', 'ramType', 'formFactor'],
  ram: ['type', 'speedMTs', 'color', 'kitConfig'],
  storage: ['capacity', 'formFactor', 'interface'],
  gpu: ['vram', 'tbp', 'color'],
  case: ['type', 'color', 'maxGpuLength', 'formFactorSupport'],
  psu: ['wattage', 'efficiency', 'modular'],
  monitor: ['resolution', 'refreshHz', 'size'],
};

/** Unit/label appended to each spec value so bare numbers are self-explanatory. */
const SPEC_UNITS: Record<string, string> = {
  cores: ' cores',
  tdp: ' W',
  tbp: ' W',
  wattage: ' W',
  height: ' mm',
  length: ' mm',
  maxGpuLength: ' mm',
  speedMTs: ' MT/s',
  capacity: ' GB',
  vram: ' GB',
  refreshHz: ' Hz',
  size: '"',
};

/** Categories where a CPU socket is a meaningful filter. */
const SOCKET_CATEGORIES: BuilderCategory[] = ['cpu', 'cooler', 'motherboard'];

/** Current AU sockets in the catalogue (see server/src/seed/data). */
const SOCKET_OPTIONS = ['AM5', 'AM4', 'LGA 1700', 'LGA 1851', 'LGA 1200'];

interface Props {
  category: BuilderCategory;
  label: string;
  onAdd: (component: Component) => void;
  onClose: () => void;
  /** pre-selected socket (from an already-chosen CPU/motherboard) → context-aware picker */
  defaultSocket?: string;
}

/** Modal part-picker: search + manufacturer + socket + sort filters over the catalogue. */
export function PartPicker({ category, label, onAdd, onClose, defaultSocket }: Props) {
  const comparable = BUILDER_CATEGORY_META.find((m) => m.id === category)?.comparable ?? false;
  const socketRelevant = SOCKET_CATEGORIES.includes(category);

  const [q, setQ] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [socket, setSocket] = useState(socketRelevant ? (defaultSocket ?? '') : '');
  // "Performance" only means something for benchmarked categories; others default to price.
  const [sort, setSort] = useState<PartSort>(comparable ? 'performance' : 'priceAsc');
  const debouncedQ = useDebouncedValue(q, 250);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['parts', category, debouncedQ, manufacturer, socket, sort],
    queryFn: () =>
      api.listParts({
        category,
        q: debouncedQ || undefined,
        manufacturer: manufacturer || undefined,
        socket: socket || undefined,
        sort,
        pageSize: 1000,
      }),
  });

  const specKeys = SPEC_KEYS[category];

  return (
    <div className="picker-root" role="dialog" aria-modal="true" aria-label={`Choose a ${label}`}>
      <div className="picker-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="picker-panel">
        <div className="picker-head">
          <h3>Choose a {label}</h3>
          <button type="button" className="drawer-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="picker-filters">
          <input
            type="search"
            placeholder={`Search ${label}…`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={`Search ${label}`}
          />
          <input
            type="text"
            placeholder="Manufacturer"
            value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
            aria-label="Manufacturer"
          />
          {socketRelevant && (
            <select value={socket} onChange={(e) => setSocket(e.target.value)} aria-label="Socket">
              <option value="">Any socket</option>
              {SOCKET_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          <select value={sort} onChange={(e) => setSort(e.target.value as PartSort)} aria-label="Sort">
            {comparable && <option value="performance">Performance</option>}
            <option value="priceAsc">Price: low → high</option>
            <option value="priceDesc">Price: high → low</option>
            <option value="name">Name</option>
          </select>
        </div>

        <div className="picker-list">
          {isLoading && <p className="muted">Loading…</p>}
          {isError && <p className="muted">Couldn’t load parts.</p>}
          {data?.components.map((c) => (
            <div key={c.id} className="picker-row">
              <Thumb className="picker-thumb" imageUrl={c.imageUrl} category={category} name={c.name} />
              <div className="picker-info">
                <span className="picker-name">{c.name}</span>
                <span className="picker-specs">{specSummary(c.specs, specKeys, SPEC_UNITS)}</span>
              </div>
              <span className="picker-price tabnum">{formatAud(bestPrice(c))}</span>
              <button type="button" className="btn-add" onClick={() => onAdd(c)}>
                + Add
              </button>
            </div>
          ))}
          {data && data.components.length === 0 && <p className="muted">No matching parts.</p>}
        </div>
        {data && (
          <div className="picker-foot muted">
            {data.total} {label.toLowerCase()} option{data.total === 1 ? '' : 's'}
          </div>
        )}
      </div>
    </div>
  );
}
