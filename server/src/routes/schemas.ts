import { z } from 'zod';
import { CATEGORIES, COMPARE_CATEGORIES, BUILDER_CATEGORIES } from '@automatorr/shared';

export const categoryParam = z.enum(CATEGORIES);
export const compareCategoryParam = z.enum(COMPARE_CATEGORIES);
export const builderCategoryParam = z.enum(BUILDER_CATEGORIES);

export const listComponentsQuery = z.object({
  category: builderCategoryParam,
  q: z.string().trim().max(100).optional(),
  manufacturer: z.string().trim().max(80).optional(),
  socket: z.string().trim().max(40).optional(),
  priceMin: z.coerce.number().nonnegative().optional(),
  priceMax: z.coerce.number().nonnegative().optional(),
  sort: z.enum(['performance', 'priceAsc', 'priceDesc', 'name']).default('performance'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const componentParams = z.object({
  category: builderCategoryParam,
  slug: z.string().min(1).max(120),
});

// ── Builder: build (list) schemas ──
export const buildItemSchema = z.object({
  category: builderCategoryParam,
  slug: z.string().min(1).max(160),
  chosenStore: z.string().min(1).max(80).optional(),
});
export const createBuildBody = z.object({
  name: z.string().trim().max(120).optional(),
  budget: z.coerce.number().positive().max(1000000).optional(),
  items: z.array(buildItemSchema).max(40).default([]),
});
export const updateBuildBody = createBuildBody;
export const buildParams = z.object({ shortId: z.string().min(3).max(40) });
export const buildSummaryQuery = z.object({ budget: z.coerce.number().positive().max(1000000).optional() });

export const comparePairQuery = z.object({
  category: compareCategoryParam,
  a: z.string().min(1).max(120),
  b: z.string().min(1).max(120),
});

const sessionId = z.string().min(1).max(100);

export const searchEventBody = z.object({
  type: z.enum(['search', 'view']).default('search'),
  category: compareCategoryParam,
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

export const conversionEventBody = z.object({
  store: z.string().min(1).max(80),
  componentId: z.string().max(64).optional(),
  url: z.string().url().max(600).optional(),
  orderRef: z.string().max(120).optional(),
  value: z.coerce.number().nonnegative().max(1000000).optional(),
  sessionId: z.string().min(1).max(100).optional(),
});

export const adminLoginBody = z.object({
  username: z.string().min(1).max(80),
  password: z.string().min(1).max(200),
});

export const analyticsQuery = z.object({
  window: z.enum(['day', 'week', 'month']).default('week'),
});

export const affiliateStoreParams = z.object({ store: z.string().min(1).max(80) });

export const affiliateUpdateBody = z
  .object({
    mode: z.enum(['off', 'tag', 'wrapper']),
    paramName: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]+$/, 'paramName must be alphanumeric / _ / -')
      .max(40)
      .optional(),
    tag: z.string().trim().max(200).optional(),
    wrapperTemplate: z.string().trim().max(600).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.mode === 'tag' && !val.tag) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tag'], message: 'tag is required in tag mode' });
    }
    if (val.mode === 'wrapper') {
      if (!val.wrapperTemplate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['wrapperTemplate'], message: 'wrapperTemplate is required in wrapper mode' });
      } else if (!val.wrapperTemplate.includes('{url}')) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['wrapperTemplate'], message: 'wrapperTemplate must contain {url}' });
      } else if (!/^https?:\/\//i.test(val.wrapperTemplate)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['wrapperTemplate'], message: 'wrapperTemplate must start with http:// or https://' });
      }
    }
  });
