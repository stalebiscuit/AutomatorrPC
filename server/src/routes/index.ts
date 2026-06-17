import { Router } from 'express';
import { healthRouter } from './health.js';
import { categoriesRouter } from './categories.js';
import { componentsRouter } from './components.js';
import { compareRouter } from './compare.js';
import { verdictRouter } from './verdict.js';
import { eventsRouter } from './events.js';
import { adminRouter } from './admin.js';

/**
 * Aggregate API router mounted at /api. Each phase adds its routers here:
 *   Phase 1 — health
 *   Phase 3 — categories, components, compare, verdict
 *   Phase 5 — events, admin
 */
export function createApiRouter(): Router {
  const api = Router();
  api.use(healthRouter);
  api.use(categoriesRouter);
  api.use(componentsRouter);
  api.use(compareRouter);
  api.use(verdictRouter);
  api.use(eventsRouter);
  api.use(adminRouter);
  return api;
}
