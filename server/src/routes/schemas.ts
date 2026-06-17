import { z } from 'zod';
import { CATEGORIES } from '@automatorr/shared';

export const categoryParam = z.enum(CATEGORIES);

export const listComponentsQuery = z.object({
  category: categoryParam,
  q: z.string().trim().max(100).optional(),
});

export const componentParams = z.object({
  category: categoryParam,
  slug: z.string().min(1).max(120),
});

export const comparePairQuery = z.object({
  category: categoryParam,
  a: z.string().min(1).max(120),
  b: z.string().min(1).max(120),
});

const sessionId = z.string().min(1).max(100);

export const searchEventBody = z.object({
  type: z.enum(['search', 'view']).default('search'),
  category: categoryParam,
  query: z.string().max(100).optional(),
  componentId: z.string().max(64).optional(),
  pairKey: z.string().max(260).optional(),
  sessionId,
});

export const clickEventBody = z.object({
  componentId: z.string().min(1).max(64),
  store: z.string().min(1).max(80),
  url: z.string().url().max(600),
  sessionId,
});

export const adminLoginBody = z.object({
  username: z.string().min(1).max(80),
  password: z.string().min(1).max(200),
});

export const analyticsQuery = z.object({
  window: z.enum(['day', 'week', 'month']).default('week'),
});
