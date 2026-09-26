/** The Express app, exported without listening so tests can drive it with Supertest. */
import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import express, { Router } from 'express';
import { pinoHttp } from 'pino-http';
import { authRouter } from './auth/routes';
import { logger } from './lib/logger';
import { requireAuth } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/errors';
import { createLimits, csrfGuard } from './middleware/security';
import { movesRouter, stockRouter } from './inventory/routes';
import { operationsRouter } from './operations/routes';
import { dashboardRouter, usersRouter } from './dashboard/routes';
import { eventsRouter } from './events/routes';
import {
  categoriesRouter,
  locationsRouter,
  partnersRouter,
  productsRouter,
  reorderRulesRouter,
  warehousesRouter,
} from './masterdata/routes';

export function createApp(opts: { sseHeartbeatMs?: number } = {}) {
  const app = express();
  const limits = createLimits();

  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
    }),
  );
  app.use(cookieParser());
  app.use(csrfGuard);
  // A CSV import carries the whole file in its JSON body.
  app.use('/api/v1/products/import', express.json({ limit: '2mb' }));
  app.use(express.json({ limit: '1mb' }));

  const api = Router();
  api.get('/health', (_req, res) => {
    res.json({ data: { ok: true } });
  });
  api.use('/auth', authRouter(limits));
  // Everything below needs a session; the general limit is keyed by it.
  api.use(limits.general);
  api.use('/operations', requireAuth, operationsRouter());
  api.use('/stock', requireAuth, stockRouter());
  api.use('/moves', requireAuth, movesRouter());
  api.use('/products', requireAuth, productsRouter());
  api.use('/reorder-rules', requireAuth, reorderRulesRouter());
  api.use('/categories', requireAuth, categoriesRouter());
  api.use('/warehouses', requireAuth, warehousesRouter());
  api.use('/locations', requireAuth, locationsRouter());
  api.use('/partners', requireAuth, partnersRouter());
  api.use('/dashboard', requireAuth, dashboardRouter());
  api.use('/users', requireAuth, usersRouter());
  api.use('/events', requireAuth, eventsRouter({ heartbeatMs: opts.sseHeartbeatMs }));

  app.use('/api/v1', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
