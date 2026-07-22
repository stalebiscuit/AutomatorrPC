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
  pageSize: z.coerce.number().int().min(1).max(1000).default(25),
});

export const componentParams = z.object({
  category: builderCategoryParam,
  slug: z.string().min(1).max(200),
});

// ── Builder: build (list) schemas ──
export const buildItemSchema = z.object({
  category: builderCategoryParam,
  slug: z.string().min(1).max(200),
  chosenStore: z.string().min(1).max(80).optional(),
});
export const createBuildBody = z.object({
  name: z.string().trim().max(120).optional(),
  budget: z.coerce.number().positive().max(1000000).optional(),
  items: z.array(buildItemSchema).max(40).default([]),
});
/**
 * Partial PATCH schema (review fix 1.3): previously `updateBuildBody =
 * createBuildBody`, whose `items` default of [] meant a PATCH sending only
 * `{name}` silently deleted every part in the build. Only provided fields
 * are updated now.
 */
export const updateBuildBody = z
  .object({
    name: z.string().trim().max(120).optional(),
    budget: z.coerce.number().positive().max(1000000).optional(),
    items: z.array(buildItemSchema).max(40).optional(),
  })
  .refine((v) => v.name !== undefined || v.budget !== undefined || v.items !== undefined, {
    message: 'nothing to update',
  });
export const buildParams = z.object({ shortId: z.string().min(3).max(40) });
export const buildSummaryQuery = z.object({ budget: z.coerce.number().positive().max(1000000).optional() });

export const comparePairQuery = z.object({
  category: compareCategoryParam,
  a: z.string().min(1).max(200),
  b: z.string().min(1).max(200),
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

// ── Admin auth (email OTP) ──
export const requestOtpBody = z.object({
  email: z.string().trim().email().max(200),
});
export const verifyOtpBody = z.object({
  email: z.string().trim().email().max(200),
  code: z.string().trim().regex(/^\d{6}$/, 'code must be 6 digits'),
});

// ── Admin management (super-admin only) ──
export const allowedDomainBody = z.object({
  // Accept what admins naturally type — "@automatorr.com", "https://automatorr.com/",
  // "AUTOMATORR.COM" — and normalise to the bare host before validating.
  domain: z.preprocess(
    (v) =>
      typeof v === 'string'
        ? v
            .trim()
            .toLowerCase()
            .replace(/^@+/, '')
            .replace(/^https?:\/\//, '')
            .replace(/\/.*$/, '')
            .replace(/^.*@/, '') // tolerate a full email like "me@automatorr.com"
        : v,
    z
      .string()
      .max(253)
      .regex(/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i, 'invalid domain'),
  ),
  note: z.string().trim().max(200).optional(),
});
export const objectIdParams = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/i, 'invalid id'),
});
export const createAdminUserBody = z.object({
  email: z.string().trim().email().max(200),
  displayName: z.string().trim().max(120).optional(),
});
export const updateAdminUserBody = z
  .object({
    status: z.enum(['active', 'disabled']).optional(),
    displayName: z.string().trim().max(120).optional(),
  })
  .refine((v) => v.status !== undefined || v.displayName !== undefined, {
    message: 'nothing to update',
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

// ── Feedback (launch-polish P4) ──
export const feedbackBody = z.object({
  type: z.enum(['idea', 'bug', 'data', 'other']),
  message: z
    .string()
    .trim()
    .min(10)
    .max(2000)
    .refine((s) => s.split(/\s+/).filter(Boolean).length <= 200, {
      message: 'message must be at most 200 words',
    }),
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
  context: z
    .object({
      path: z.string().trim().max(300).optional(),
      category: z.string().trim().max(40).optional(),
      slugs: z.array(z.string().trim().max(120)).max(4).optional(),
      buildShortId: z.string().trim().max(40).optional(),
    })
    .optional(),
  sessionId: sessionId.optional(),
  /** Honeypot — humans never see this field; bots that fill it are dropped. */
  website: z.string().max(200).optional(),
});

export const feedbackListQuery = z.object({
  status: z.enum(['new', 'reviewed', 'done', 'dismissed']).optional(),
  type: z.enum(['idea', 'bug', 'data', 'other']).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});

export const feedbackUpdateBody = z
  .object({
    status: z.enum(['new', 'reviewed', 'done', 'dismissed']).optional(),
    adminNote: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.status !== undefined || v.adminNote !== undefined, {
    message: 'nothing to update',
  });
