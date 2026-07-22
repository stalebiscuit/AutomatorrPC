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

/**
 * Same-origin API base. Set per environment via VITE_BASE_API_URL (see
 * client/.env.*), defaulting to '/api' so a missing frontend env var never
 * silently turns app calls into unproxied 404s. The frontend always talks to a
 * reverse-proxied same-origin path — never a hardcoded backend host.
 */
const API_BASE = import.meta.env.VITE_BASE_API_URL ?? '/api';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Single-flight silent refresh: many concurrent 401s share one refresh call.
let refreshInFlight: Promise<boolean> | null = null;
function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE}/admin/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'x-csrf': '1' },
    })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function request<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
  const isAdmin = path.startsWith('/admin');
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  // Custom header is the CSRF defense (paired with SameSite=strict cookies).
  if (isAdmin) headers['x-csrf'] = '1';

  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...init, headers });

  // On a 401 for a guarded admin call, try one silent refresh then retry once.
  if (res.status === 401 && retry && isAdmin && !path.startsWith('/admin/auth/')) {
    if (await refreshSession()) return request<T>(path, init, false);
  }

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

// ── Admin auth & access control DTOs ──
export type AdminRole = 'superadmin' | 'admin';
export interface AuthUser {
  email: string;
  role: AdminRole;
}
export interface AllowedDomainDTO {
  id: string;
  domain: string;
  note: string;
  createdBy: string;
  createdAt: string | null;
}
export interface AdminUserDTO {
  id: string;
  email: string;
  role: AdminRole;
  status: 'active' | 'disabled';
  source: string;
  displayName: string;
  createdBy: string;
  lastLoginAt: string | null;
  createdAt: string | null;
}

// ── Feedback DTOs (launch-polish P4) ──
export type FeedbackType = 'idea' | 'bug' | 'data' | 'other';
export type FeedbackStatus = 'new' | 'reviewed' | 'done' | 'dismissed';
export interface FeedbackContext {
  path?: string;
  category?: string;
  slugs?: string[];
  buildShortId?: string;
}
export interface FeedbackBody {
  type: FeedbackType;
  message: string;
  email?: string;
  context?: FeedbackContext;
  sessionId?: string;
  /** Honeypot — never populated by the real form. */
  website?: string;
}
export interface FeedbackDTO {
  id: string;
  type: FeedbackType;
  message: string;
  email: string;
  context: { path: string; category: string; slugs: string[]; buildShortId: string };
  sessionId: string;
  userAgent: string;
  status: FeedbackStatus;
  adminNote: string;
  createdAt: string | null;
  updatedAt: string | null;
}
export interface FeedbackListResponse {
  feedback: FeedbackDTO[];
  page: number;
  pageSize: number;
  total: number;
  counts: Record<FeedbackStatus, number>;
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

  updateBuild: (shortId: string, body: BuildBody, editToken: string) =>
    request<BuildSummary>(`/builds/${shortId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'x-edit-token': editToken },
    }),

  buildByMerchant: (shortId: string) =>
    request<{ merchants: MerchantTotal[] }>(`/builds/${shortId}/by-merchant`),

  // ── Events / admin ──
  postSearchEvent: (body: Record<string, unknown>) =>
    request('/events/search', { method: 'POST', body: JSON.stringify(body) }),

  postClickEvent: (body: Record<string, unknown>) =>
    request('/events/click', { method: 'POST', body: JSON.stringify(body) }),

  // ── Admin auth (email OTP) ──
  requestOtp: (email: string) =>
    request<{ ok: true }>('/admin/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  verifyOtp: (email: string, code: string) =>
    request<{ user: AuthUser }>('/admin/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    }),
  authMe: () => request<{ authenticated: boolean; user?: AuthUser }>('/admin/auth/me'),
  authRefresh: () => request<{ user: AuthUser }>('/admin/auth/refresh', { method: 'POST' }),
  authLogout: () => request<{ ok: true }>('/admin/auth/logout', { method: 'POST' }),

  // ── Allowed domains (super-admin) ──
  listDomains: () => request<{ domains: AllowedDomainDTO[] }>('/admin/allowed-domains'),
  createDomain: (domain: string, note?: string) =>
    request<{ domain: AllowedDomainDTO }>('/admin/allowed-domains', {
      method: 'POST',
      body: JSON.stringify({ domain, note }),
    }),
  updateDomain: (id: string, domain: string, note?: string) =>
    request<{ domain: AllowedDomainDTO }>(`/admin/allowed-domains/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ domain, note }),
    }),
  deleteDomain: (id: string) =>
    request<{ ok: true }>(`/admin/allowed-domains/${id}`, { method: 'DELETE' }),

  // ── Users (super-admin) ──
  listUsers: () => request<{ users: AdminUserDTO[] }>('/admin/users'),
  createUser: (email: string, displayName?: string) =>
    request<{ user: AdminUserDTO }>('/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email, displayName }),
    }),
  updateUser: (id: string, patch: { status?: 'active' | 'disabled'; displayName?: string }) =>
    request<{ user: AdminUserDTO }>(`/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteUser: (id: string) => request<{ ok: true }>(`/admin/users/${id}`, { method: 'DELETE' }),

  analytics: (window: AnalyticsWindow) =>
    request<AnalyticsResponse>(`/admin/analytics${qs({ window })}`),

  builderAnalytics: (window: AnalyticsWindow) =>
    request<BuilderAnalyticsResponse>(`/admin/analytics/builder${qs({ window })}`),

  postConversionEvent: (body: Record<string, unknown>) =>
    request('/events/conversion', { method: 'POST', body: JSON.stringify(body) }),

  // ── Feedback (launch-polish P4) ──
  postFeedback: (body: FeedbackBody) =>
    request<{ ok: true }>('/feedback', { method: 'POST', body: JSON.stringify(body) }),

  listFeedback: (filters: { status?: FeedbackStatus; type?: FeedbackType; page?: number }) =>
    request<FeedbackListResponse>(
      `/admin/feedback${qs({
        status: filters.status,
        type: filters.type,
        page: filters.page !== undefined ? String(filters.page) : undefined,
      })}`,
    ),

  updateFeedback: (id: string, patch: { status?: FeedbackStatus; adminNote?: string }) =>
    request<{ feedback: FeedbackDTO }>(`/admin/feedback/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  getAffiliates: () => request<{ stores: AffiliateLinkConfig[] }>('/admin/affiliates'),

  putAffiliate: (store: string, body: AffiliateUpdateBody) =>
    request<{ store: AffiliateLinkConfig }>(`/admin/affiliates/${encodeURIComponent(store)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
};
