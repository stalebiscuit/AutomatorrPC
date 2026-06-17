import express, { type Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { loadConfig } from './config.js';
import { createApiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

/**
 * Build the Express app (no listening) so it can be exercised by Supertest.
 * CORS is locked to CLIENT_ORIGIN; credentials enabled for the admin cookie.
 */
export function createApp(): Express {
  const cfg = loadConfig();
  const app = express();

  app.disable('x-powered-by');
  app.use(
    cors({
      origin: cfg.CLIENT_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  app.use('/api', createApiRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
