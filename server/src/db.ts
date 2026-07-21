import mongoose from 'mongoose';
import { loadConfig } from './config.js';
import { logger } from './lib/logger.js';

mongoose.set('strictQuery', true);

export interface ConnectOptions {
  uri?: string;
  retries?: number;
  retryDelayMs?: number;
}

/**
 * Connect to MongoDB with bounded retry + logging. Idempotent: returns the
 * existing connection if already connected (handy for tests/seeds/scrapers).
 */
export async function connectDb(opts: ConnectOptions = {}): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose;

  const uri = opts.uri ?? loadConfig().MONGODB_URI;
  const retries = opts.retries ?? 5;
  const retryDelayMs = opts.retryDelayMs ?? 2000;

  let attempt = 0;
  for (;;) {
    try {
      attempt += 1;
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      logger.info(`MongoDB connected (${redact(uri)})`);
      return mongoose;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt >= retries) {
        logger.error(`MongoDB connection failed after ${attempt} attempts: ${message}`);
        throw err;
      }
      logger.warn(
        `MongoDB connection attempt ${attempt}/${retries} failed: ${message}. Retrying in ${retryDelayMs}ms…`,
      );
      await sleep(retryDelayMs);
    }
  }
}

export async function disconnectDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Hide credentials in logs. */
function redact(uri: string): string {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
}
