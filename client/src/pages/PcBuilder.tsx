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
import { formatAud, freshness } from '../lib/format.js';
import { SiteFooter } from '../components/SiteFooter.js';
import { api, ApiClientError, type BuildBody } from '../lib/api.js';
import { getEditToken, storeEditToken } from '../lib/buildTokens.js';
import { useDocumentMeta } from '../lib/meta.js';
import { trackClick } from '../lib/session.js';
import '../styles/builder.css';

export function PcBuilder() {
  const { shortId: paramShortId } = useParams<{ shortId?: string }>();
  const navigate = useNavigate();

  useDocumentMeta({
    title: 'PC Builder | Speccify',
    description:
      'Build a full PC part-by-part with live compatibility checks, a wattage estimate and a build score, then find the store that sells your whole build cheapest.',
  });

  const [parts, setParts] = useState<ResolvedBuildPart[]>([]);
  const [pickerCategory, setPickerCategory] = useState<BuilderCategory | null>(null);
  const [view, setView] = useState<'overview' | 'by-merchant'>('overview');
  const [shortId, setShortId] = useState<string | undefined>(paramShortId);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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
    }
  }, [loaded]);

  // Review fix 1.4: navigating from a loaded shared build back to plain
  // /pc-builder previously kept the old parts + shortId, so "Save & share"
  // on what the user thought was a NEW build silently overwrote the shared
  // one. When the param disappears, reset to a fresh build.
  useEffect(() => {
    if (!paramShortId) {
      setParts([]);
      setShortId(undefined);
      setSaveError(null);
      setCopied(false);
    }
  }, [paramShortId]);

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
    const score = scoreBuild(parts, {});
    const merchants = pricesByMerchant(parts);
    return { compatibility, wattage, total, score, merchants };
  }, [parts]);

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
    setSaveError(null);
    try {
      const body: BuildBody = {
        items: parts.map((p) => ({ category: p.category, slug: p.component.slug, chosenStore: p.chosenStore })),
      };
      // Review fix 1.3: updates require the private edit token issued at
      // creation (kept in localStorage per shortId). Without one — e.g. a
      // build someone else shared — save creates a fresh copy instead.
      const token = shortId ? getEditToken(shortId) : null;
      const result =
        shortId && token ? await api.updateBuild(shortId, body, token) : await api.createBuild(body);
      if (result.editToken) storeEditToken(result.build.shortId, result.editToken);
      setShortId(result.build.shortId);
      navigate(`/pc-builder/${result.build.shortId}`, { replace: true });
    } catch (err) {
      // Review fix (client batch): failures were silent — surface them.
      if (err instanceof ApiClientError && err.status === 403) {
        setSaveError(
          'This shared build belongs to someone else, so it can’t be overwritten. Your changes were kept locally; remove the link from the address bar and save to create your own copy.',
        );
      } else {
        setSaveError('Couldn’t save the build. Check your connection and try again — your parts are still here.');
      }
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
        <div className="builder-head">
          <h2 className="builder-title">PC Builder</h2>
          <div className="builder-actions">
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
        </div>

        {loadFailed && paramShortId && (
          <div className="build-notfound" role="alert">
            That shared build couldn’t be found — the link may be wrong or the build was removed.
            You can start a new one below.
          </div>
        )}

        {saveError && (
          <div className="build-notfound" role="alert">
            {saveError}
          </div>
        )}

        <CompatibilityBanner result={summary.compatibility} />
        <BuildSummaryBar total={summary.total} wattage={summary.wattage} score={summary.score} />

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
                          <Thumb className="sel-thumb" imageUrl={p.component.imageUrl} category={p.component.category} name={p.component.name} brand={p.component.brand} specs={p.component.specs} />
                          <span className="sel-name">{p.component.name}</span>
                        </div>
                      </td>
                      <td className="cell-avail" title="Stock status — pending live feed">
                        {sorted.length ? 'In stock' : '—'}
                      </td>
                      <td className="tabnum cell-price">
                        {formatAud(price)}
                        {chosenQuote && freshness(chosenQuote.lastUpdated) && (
                          <span className="fresh-badge">{freshness(chosenQuote.lastUpdated)}</span>
                        )}
                      </td>
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

      <SiteFooter />
    </div>
  );
}
