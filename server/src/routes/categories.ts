import { Router } from 'express';
import { BUILDER_CATEGORY_META } from '@automatorr/shared';
import { CATEGORY_META } from '../services/categoriesMeta.js';

export const categoriesRouter = Router();

/** Comparable categories (comparison tool). */
categoriesRouter.get('/categories', (_req, res) => {
  res.json({ categories: CATEGORY_META });
});

/** All builder categories + behaviour metadata (PC Builder). */
categoriesRouter.get('/builder/categories', (_req, res) => {
  res.json({ categories: BUILDER_CATEGORY_META });
});
