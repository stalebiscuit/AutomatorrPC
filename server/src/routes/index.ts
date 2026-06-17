import { Router } from 'express';
import { healthRouter } from './health.js';

/**
 * Aggregate API router mounted at /api. Each phase adds its routers here:
 *   Phase 1 — health
 *   Phase 3 — categories, components, compare, verdict
 *   Phase 5 — events, admin
 */
export function createApiRouter(): Router {
  const api = Router();
  api.use(healthRouter);
  return api;
}
