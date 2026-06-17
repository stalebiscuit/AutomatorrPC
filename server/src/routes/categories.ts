import { Router } from 'express';
import { CATEGORY_META } from '../services/categoriesMeta.js';

export const categoriesRouter = Router();

categoriesRouter.get('/categories', (_req, res) => {
  res.json({ categories: CATEGORY_META });
});
