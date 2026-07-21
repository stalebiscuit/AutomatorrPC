import type { AffiliateLinkConfig, AffiliateMode, Component, PriceQuote } from '@automatorr/shared';
import { AffiliateLinkModel, type AffiliateLinkDoc } from '../../models/index.js';
import { RETAILER_STORES } from '../pricing/retailers/index.js';
import { applyAffiliateLink } from './applyAffiliateLink.js';

let cache = new Map<string, AffiliateLinkConfig>();
let loadedAt = 0;
const TTL_MS = 5 * 60 * 1000;

const keyOf = (store: string): string => store.trim().toLowerCase();

function toConfig(store: string, d: AffiliateLinkDoc): AffiliateLinkConfig {
  return {
    store,
    mode: d.mode === 'tag' || d.mode === 'wrapper' ? d.mode : 'off',
    paramName: d.paramName ?? 'tag',
    tag: d.tag ?? '',
    wrapperTemplate: d.wrapperTemplate ?? '',
  };
}

function defaultConfig(store: string): AffiliateLinkConfig {
  return { store, mode: 'off', paramName: 'tag', tag: '', wrapperTemplate: '' };
}

/** Load all saved configs into the in-memory cache. */
export async function loadAffiliateConfigs(): Promise<void> {
  const docs = await AffiliateLinkModel.find();
  const next = new Map<string, AffiliateLinkConfig>();
  for (const d of docs) next.set(keyOf(d.store), toConfig(d.store, d));
  cache = next;
  loadedAt = Date.now();
}

/** Reload the cache immediately (called after every admin write). */
export async function refreshAffiliateConfigs(): Promise<void> {
  await loadAffiliateConfigs();
}

/** Lazy safety reload so multi-process deploys converge within the TTL. */
export async function ensureFresh(): Promise<void> {
  if (Date.now() - loadedAt > TTL_MS) await loadAffiliateConfigs();
}

/** Copy of a component with each price URL decorated for its store. */
export function decorateComponent(component: Component): Component {
  if (!component.prices.length) return component;
  const prices: PriceQuote[] = component.prices.map((p) => ({
    ...p,
    url: applyAffiliateLink(p.url, cache.get(keyOf(p.store))),
  }));
  return { ...component, prices };
}

/** All known stores, each with its saved config or a pass-through default. */
export async function listAffiliateConfigs(): Promise<AffiliateLinkConfig[]> {
  const docs = await AffiliateLinkModel.find();
  const bySaved = new Map(docs.map((d) => [keyOf(d.store), d]));
  return RETAILER_STORES.map((store) => {
    const d = bySaved.get(keyOf(store));
    return d ? toConfig(store, d) : defaultConfig(store);
  });
}

export interface AffiliateUpdate {
  mode: AffiliateMode;
  paramName?: string;
  tag?: string;
  wrapperTemplate?: string;
}

/** Upsert one known store's config; returns null if the store is unknown. */
export async function upsertAffiliateConfig(
  store: string,
  update: AffiliateUpdate,
): Promise<AffiliateLinkConfig | null> {
  const canonical = RETAILER_STORES.find((s) => keyOf(s) === keyOf(store));
  if (!canonical) return null;
  const doc = await AffiliateLinkModel.findOneAndUpdate(
    { store: canonical },
    {
      store: canonical,
      mode: update.mode,
      paramName: update.mode === 'tag' ? (update.paramName?.trim() || 'tag') : 'tag',
      tag: update.mode === 'tag' ? (update.tag ?? '') : '',
      wrapperTemplate: update.mode === 'wrapper' ? (update.wrapperTemplate ?? '') : '',
    },
    { new: true, upsert: true, runValidators: true },
  );
  await refreshAffiliateConfigs();
  return toConfig(canonical, doc!);
}

/** Test helper — clear the module-level cache between suites. */
export function resetAffiliateCacheForTests(): void {
  cache.clear();
  loadedAt = 0;
}
