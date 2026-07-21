import type {
  AffiliateLinkConfig,
  AffiliateMode,
  AnalyticsResponse,
  AnalyticsWindow,
  BuilderAnalyticsResponse,
  BuilderCategoryMeta,
  BuildItem,
  BuildSummary,
  CompareCategory,
  CategoryMeta,
  Component,
  CompareResult,
  MerchantTotal,
  PartFilters,
  PartListResult,
  VerdictResponse,
} from '@automatorr/shared';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    ...init,
  });
  if (!res.ok) {
    let code = 'ERROR';
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string; code?: string };
      code = body.code ?? code;
      message = body.error ?? message;
    } catch {
      /* non-JSON error */
    }
    throw new ApiClientError(res.status, code, message);
  }
  return (await res.json()) as T;
}

const qs = (params: Record<string, string | undefined>): string => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : '';
};

/** Serialise picker filters (numbers → strings, defaults dropped). */
const partQs = (f: PartFilters): string =>
  qs({
    category: f.category,
    q: f.q,
    manufacturer: f.manufacturer,
    socket: f.socket,
    priceMin: f.priceMin !== undefined ? String(f.priceMin) : undefined,
    priceMax: f.priceMax !== undefined ? String(f.priceMax) : undefined,
    sort: f.sort,
    page: f.page !== undefined ? String(f.page) : undefined,
    pageSize: f.pageSize !== undefined ? String(f.pageSize) : undefined,
  });

export interface BuildBody {
  name?: string;
  budget?: number;
  items: BuildItem[];
}

export interface AffiliateUpdateBody {
  mode: AffiliateMode;
  paramName?: string;
  tag?: string;
  wrapperTemplate?: string;
}

export const api = {
  getCategories: () => request<{ categories: CategoryMeta[] }>('/categories'),

  listComponents: (category: CompareCategory, q?: string) =>
    request<{ components: Component[] }>(`/components${qs({ category, q, pageSize: '1000' })}`),

  getComponent: (category: CompareCategory, slug: string) =>
    request<{ component: Component }>(`/components/${category}/${slug}`),

  compare: (category: CompareCategory, a: string, b: string) =>
    request<CompareResult>(`/compare${qs({ category, a, b })}`),

  verdict: (category: CompareCategory, a: string, b: string) =>
    request<VerdictResponse>(`/verdict${qs({ category, a, b })}`),

  // ── PC Builder ──
  getBuilderCategories: () =>
    request<{ categories: BuilderCategoryMeta[] }>('/builder/categories'),

  listParts: (filters: PartFilters) => request<PartListResult>(`/components${partQs(filters)}`),

  createBuild: (body: BuildBody) =>
    request<BuildSummary>('/builds', { method: 'POST', body: JSON.stringify(body) }),

  getBuild: (shortId: string, budget?: number) =>
    request<BuildSummary>(
      `/builds/${shortId}${qs({ budget: budget !== undefined ? String(budget) : undefined })}`,
    ),

  updateBuild: (shortId: string, body: BuildBody) =>
    request<BuildSummary>(`/builds/${shortId}`, { method: 'PATCH', body: JSON.stringify(body) }),

  buildByMerchant: (shortId: string) =>
    request<{ merchants: MerchantTotal[] }>(`/builds/${shortId}/by-merchant`),

  // ── Events / admin ──
  postSearchEvent: (body: Record<string, unknown>) =>
    request('/events/search', { method: 'POST', body: JSON.stringify(body) }),

  postClickEvent: (body: Record<string, unknown>) =>
    request('/events/click', { method: 'POST', body: JSON.stringify(body) }),

  adminLogin: (username: string, password: string) =>
    request<{ ok: boolean; username: string }>('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  adminLogout: () => request('/admin/logout', { method: 'POST' }),

  analytics: (window: AnalyticsWindow) =>
    request<AnalyticsResponse>(`/admin/analytics${qs({ window })}`),

  builderAnalytics: (window: AnalyticsWindow) =>
    request<BuilderAnalyticsResponse>(`/admin/analytics/builder${qs({ window })}`),

  postConversionEvent: (body: Record<string, unknown>) =>
    request('/events/conversion', { method: 'POST', body: JSON.stringify(body) }),

  getAffiliates: () => request<{ stores: AffiliateLinkConfig[] }>('/admin/affiliates'),

  putAffiliate: (store: string, body: AffiliateUpdateBody) =>
    request<{ store: AffiliateLinkConfig }>(`/admin/affiliates/${encodeURIComponent(store)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
};
