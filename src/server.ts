import path from 'node:path';
import express, { NextFunction, Request, Response } from 'express';
import { config, missingCredentials } from './config';
import { authRouter } from './routes/auth';
import { shopsRouter } from './routes/shops';
import { ordersRouter } from './routes/orders';

export function createServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  // Lightweight request logging.
  app.use((req, _res, next) => {
    // eslint-disable-next-line no-console
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
  });

  // App status — lets the frontend show a setup banner when creds are missing.
  app.get('/api/status', (_req, res) => {
    res.json({
      configured: missingCredentials().length === 0,
      missing: missingCredentials(),
      host: config.host,
      region: config.region,
      redirectUrl: config.redirectUrl,
    });
  });

  app.use('/auth', authRouter);
  app.use('/api/shops', shopsRouter);
  app.use('/api/orders', ordersRouter);

  // Static dashboard.
  const publicDir = path.resolve(process.cwd(), 'public');
  app.use(express.static(publicDir));

  // 404 for unknown API routes.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  // Centralized error handler.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error('Unhandled error:', message);
    res.status(500).json({ error: 'internal_error', message });
  });

  return app;
}
