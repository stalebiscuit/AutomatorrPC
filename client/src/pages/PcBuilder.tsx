import { Fragment, useEffect, useMemo, useState } from 'react';
import { Thumb } from '../components/Thumb.js';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type {
  BuilderCategory,
  Component,
  ResolvedBuildPart,
} from '@automatorr/shared';
import {
  BUILDER_CATEGORY_META,
  checkCompatibility,
  wattageEstimate,
  buildTotal,
  scoreBuild,
  pricesByMerchant,
  effectivePrice,
} from '@automatorr/shared';
import { TopBar } from '../components/TopBar.js';
import { PartPicker } from '../components/builder/PartPicker.js';
import { CompatibilityBanner } from '../components/builder/CompatibilityBanner.js';
import { BuildSummaryBar } from '../components/builder/BuildSummaryBar.js';
import { PricesByMerchant } from '../components/builder/PricesByMerchant.js';
import { formatAud } from '../lib/format.js';
import { api, type BuildBody } from '../lib/api.js';
import { trackClick } from '../lib/session.js';
import '../styles/builder.css';

export function PcBuilder() {
  const { shortId: paramShortId } = useParams<{ shortId?: string }>();
  const navigate = useNavigate();

  const [parts, setParts] = useState<ResolvedBuildPart[]>([]);
  const [budgetInput, setBudgetInput] = useState('');
  const [pickerCategory, setPickerCategory] = useState<BuilderCategory | null>(null);
  const [view, setView] = useState<'overview' | 'by-merchant'>('overview');
  const [shortId, setShortId] = useState<string | undefined>(paramShortId);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Hydrate an existing shared build from the server (permalink).
  const { data: loaded, isError: loadFailed } = useQuery({
    queryKey: ['build', paramShortId],
    queryFn: () => api.getBuild(paramShortId as string),
    enabled: Boolean(paramShortId),
    retry: false,
  });
  useEffect(() => {
    if (loaded) {
      setParts(loaded.parts);
      setShortId(loaded.build.shortId);
      if (loaded.build.budget) setBudgetInput(String(loaded.build.budget));
    }
  }, [loaded]);

  const budget = budgetInput ? Number(budgetInput) : undefined;

  // Socket already committed by a chosen CPU or motherboard — used to pre-filter
  // the picker so a user with an AM5 board only sees AM5 CPUs/coolers.
  const buildSocket = useMemo(() => {
    const cpu = parts.find((p) => p.category === 'cpu')?.component;
    const mobo = parts.find((p) => p.category === 'motherboard')?.component;
    const raw = cpu?.specs.socket ?? mobo?.specs.socket;
    return typeof raw === 'string' && raw.trim() ? raw : undefined;
  }, [parts]);

  const summary = useMemo(() => {
    const compatibility = checkCompatibility(parts);
    const wattage = wattageEstimate(parts);
    const total = buildTotal(parts);
    const score = scoreBuild(parts, budget ? { budget } : {});
    const merchants = pricesByMerchant(parts);
    return { compatibility, wattage, total, score, merchants };
  }, [parts, budget]);

  const addPart = (component: Component) => {
    const category = pickerCategory;
    if (!category) return;
    const meta = BUILDER_CATEGORY_META.find((m) => m.id === category);
    setParts((prev) => {
      const next = meta?.multiInstance ? prev.slice() : prev.filter((p) => p.category !== category);
      next.push({ category, component });
      return next;
    });
    setPickerCategory(null);
  };

  const removePart = (index: number) => {
    setParts((prev) => prev.filter((_, i) => i !== index));
  };

  const setStore = (index: number, store: string) => {
    setParts((prev) => prev.map((p, i) => (i === index ? { ...p, chosenStore: store } : p)));
  };

  const save = async () => {
    setSaving(true);
    try {
      const body: BuildBody = {
        budget,
        items: parts.map((p) => ({ category: p.category, slug: p.component.slug, chosenStore: p.chosenStore })),
      };
      const result = shortId ? await api.updateBuild(shortId, body) : await api.createBuild(body);
      setShortId(result.build.shortId);
      navigate(`/pc-builder/${result.build.shortId}`, { replace: true });
    } finally {
      setSaving(false);
    }
  };

  const permalink = shortId ? `${window.location.origin}/pc-builder/${shortId}` : '';
  const copyPermalink = async () => {
    if (!permalink) return;
    try {
      await navigator.clipboard.writeText(permalink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="wrap">
      <TopBar />

      <section aria-label="PC Builder" className="builder">
        <h2 className="builder-title">PC Builder</h2>

        {loadFailed && paramShortId && (
          <div className="build-notfound" role="alert">
            That shared build couldn’t be found — the link may be wrong or the build was removed.
            You can start a new one below.
          </div>
        )}

        <div className="builder-controls">
          <label
            className="budget-field"
            title="Sets the target used by the build score (budget-fit, 25/100). It doesn't filter parts — it rewards using your budget well and flags going over."
          >
            Budget (AUD)
            <input
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="e.g. 2000"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
            />
            <span className="field-hint">Used by the build score — not a hard filter.</span>
          </label>
          <button type="button" className="btn-primary" onClick={save} disabled={saving || parts.length === 0}>
            {saving ? 'Saving…' : shortId ? 'Update & share' : 'Save & share'}
          </button>
          {permalink && (
            <div className="permalink">
              <input readOnly value={permalink} aria-label="Shareable link" onFocus={(e) => e.currentTarget.select()} />
              <button type="button" onClick={copyPermalink}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>

        <CompatibilityBanner result={summary.compatibility} />
        <BuildSummaryBar total={summary.total} wattage={summary.wattage} score={summary.score} budget={budget} />

        <div className="builder-tabs">
          <button
            type="button"
            className={view === 'overview' ? 'tab active' : 'tab'}
            onClick={() => setView('overview')}
          >
            Overview
          </button>
          <button
            type="button"
            className={view === 'by-merchant' ? 'tab active' : 'tab'}
            onClick={() => setView('by-merchant')}
          >
            Prices by merchant
          </button>
        </div>

        {view === 'overview' ? (
          <div className="build-table-wrap">
          <table className="build-table build-table--full">
            <thead>
              <tr>
                <th>Component</th>
                <th>Selection</th>
                <th>Availability</th>
                <th>Price</th>
                <th>Where</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {BUILDER_CATEGORY_META.map((meta) => {
                const chosen = parts
                  .map((p, i) => ({ p, i }))
                  .filter(({ p }) => p.category === meta.id);
                const rows = chosen.map(({ p, i }) => {
                  const sorted = [...p.component.prices].sort((a, b) => a.price - b.price);
                  const chosenStore = p.chosenStore ?? sorted[0]?.store;
                  const chosenQuote = sorted.find((pr) => pr.store === chosenStore) ?? sorted[0];
                  const price = effectivePrice(p);
                  return (
                    <tr key={`${meta.id}-${p.component.id}-${i}`}>
                      <td className="cell-cat">{meta.label}</td>
                      <td>
                        <div className="sel-cell">
                          <Thumb className="sel-thumb" imageUrl={p.component.imageUrl} category={p.component.category} name={p.component.name} />
                          <span className="sel-name">{p.component.name}</span>
                        </div>
                      </td>
                      <td className="cell-avail" title="Stock status — pending live feed">
                        {sorted.length ? 'In stock' : '—'}
                      </td>
                      <td className="tabnum cell-price">{formatAud(price)}</td>
                      <td>
                        {sorted.length ? (
                          <div className="where-cell">
                            <select
                              value={chosenStore}
                              onChange={(e) => setStore(i, e.target.value)}
                              aria-label={`Merchant for ${p.component.name}`}
                            >
                              {sorted.map((pr) => (
                                <option key={pr.store} value={pr.store}>
                                  {pr.store} — {formatAud(pr.price)}
                                </option>
                              ))}
                            </select>
                            {chosenQuote && (
                              <a
                                className="buy-link"
                                href={chosenQuote.url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={() =>
                                  void trackClick({
                                    componentId: p.component.id,
                                    store: chosenQuote.store,
                                    url: chosenQuote.url,
                                  })
                                }
                              >
                                Buy
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="cell-ph">—</span>
                        )}
                      </td>
                      <td>
                        <button type="button" className="btn-remove" aria-label="Remove" onClick={() => removePart(i)}>
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                });
                const showChoose = chosen.length === 0 || meta.multiInstance;
                return (
                  <Fragment key={meta.id}>
                    {rows}
                    {showChoose && (
                      <tr key={`${meta.id}-choose`}>
                        <td className="cell-cat">{chosen.length === 0 ? meta.label : ''}</td>
                        <td colSpan={5}>
                          <button type="button" className="btn-choose" onClick={() => setPickerCategory(meta.id)}>
                            + Choose {meta.multiInstance && chosen.length > 0 ? 'another ' : ''}
                            {meta.label}
                          </button>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        ) : (
          <PricesByMerchant merchants={summary.merchants} />
        )}
      </section>

      {pickerCategory && (
        <PartPicker
          category={pickerCategory}
          label={BUILDER_CATEGORY_META.find((m) => m.id === pickerCategory)?.label ?? pickerCategory}
          onAdd={addPart}
          onClose={() => setPickerCategory(null)}
          defaultSocket={
            pickerCategory === 'cpu' || pickerCategory === 'cooler' || pickerCategory === 'motherboard'
              ? buildSocket
              : undefined
          }
        />
      )}
    </div>
  );
}
