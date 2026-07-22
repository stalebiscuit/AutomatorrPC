import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express, Router } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { loadConfig } from './config.js';
import { createApiRouter } from './routes/index.js';
import { createTestHooksRouter, testHooksEnabled } from './routes/testHooks.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { logger } from './lib/logger.js';

const CLIENT_DIST = join(dirname(fileURLToPath(import.meta.url)), '../../client/dist');

/**
 * Build the Express app (no listening) so it can be exercised by Supertest.
 * CORS is locked to CLIENT_ORIGIN; credentials enabled for the admin cookie.
 * In production it also serves the built client (SPA fallback) when present.
 */
export function createApp(): Express {
  const cfg = loadConfig();
  const app = express();

  // Behind the production reverse proxy (nginx/Caddy) so req.secure and req.ip
  // reflect the real client — needed for Secure cookies and rate limiting.
  if (cfg.NODE_ENV === 'production') app.set('trust proxy', 1);

  app.disable('x-powered-by');
  app.use(cors({ origin: cfg.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  app.use('/api', createApiRouter());

  // E2E test seam — only when explicitly enabled and never in production.
  // Logged loudly so it can never be left on unnoticed.
  if (testHooksEnabled()) {
    logger.warn(
      '[test-hooks] E2E test hooks are ENABLED (E2E_TEST_HOOKS=true). This must NEVER be set in production.',
    );
    app.use('/api', createTestHooksRouter());
  }

  // Unmatched API routes → typed 404 (kept distinct from SPA routes).
  const apiNotFound = Router();
  apiNotFound.use(notFoundHandler);
  app.use('/api', apiNotFound);

  // Serve the built client + SPA fallback (production / single-origin deploy).
  if (existsSync(join(CLIENT_DIST, 'index.html'))) {
    app.use(express.static(CLIENT_DIST));
    app.get('*', (_req, res) => res.sendFile(join(CLIENT_DIST, 'index.html')));
  } else {
    app.use(notFoundHandler);
  }

  app.use(errorHandler);
  return app;
}
