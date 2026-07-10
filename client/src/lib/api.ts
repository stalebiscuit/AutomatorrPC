import type {
  AnalyticsResponse,
  AnalyticsWindow,
  Category,
  CategoryMeta,
  Component,
  CompareResult,
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

export const api = {
  getCategories: () => request<{ categories: CategoryMeta[] }>('/categories'),

  listComponents: (category: Category, q?: string) =>
    request<{ components: Component[] }>(`/components${qs({ category, q })}`),

  getComponent: (category: Category, slug: string) =>
    request<{ component: Component }>(`/components/${category}/${slug}`),

  compare: (category: Category, a: string, b: string) =>
    request<CompareResult>(`/compare${qs({ category, a, b })}`),

  verdict: (category: Category, a: string, b: string) =>
    request<VerdictResponse>(`/verdict${qs({ category, a, b })}`),

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
};
