import { Router } from 'express';
import mongoose from 'mongoose';

export const healthRouter = Router();

const READY_STATES: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
  99: 'uninitialized',
};

healthRouter.get('/health', (_req, res) => {
  const state = mongoose.connection.readyState;
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    db: READY_STATES[state] ?? 'unknown',
    ts: new Date().toISOString(),
  });
});
