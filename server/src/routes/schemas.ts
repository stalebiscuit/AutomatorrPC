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
