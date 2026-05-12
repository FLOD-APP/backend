import express from 'express';
import cors from 'cors';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schemaTypes from './db/schema.js';
import { httpLogger, logger } from './middleware/logger.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';
import { healthRoutes } from './routes/health.routes.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createBranchRouter } from './routes/branch.routes.js';
import { createProductRouter } from './routes/product.routes.js';
import { createPackageRouter } from './routes/package.routes.js';
import { createRotationRouter } from './routes/rotation.routes.js';
import { createSettingsRouter } from './routes/settings.routes.js';
import { createUserRouter } from './routes/user.routes.js';
import { createPricingRouter } from './routes/pricing.routes.js';
import { createSubscriptionRouter } from './routes/subscription.routes.js';
import { createCheckInRouters } from './routes/checkin.routes.js';

interface AppDeps {
  checkDb: () => Promise<boolean>;
  version: string;
  db?: PostgresJsDatabase<typeof schemaTypes>;
}

export function createApp(deps: AppDeps) {
  const app = express();

  // Middleware
  app.use(cors({ origin: process.env['CORS_ORIGIN'] ?? '*' }));
  app.use(express.json());
  app.use(httpLogger);

  // Health check (no /api/v1 prefix — must be accessible without auth)
  app.use(healthRoutes(deps.checkDb, deps.version));

  // API v1 routes
  if (deps.db) {
    app.use('/api/v1/auth', createAuthRouter(deps.db));
    app.use('/api/v1/branches', createBranchRouter(deps.db));

    const { productRouter, categoryRouter } = createProductRouter(deps.db);
    app.use('/api/v1/products', productRouter);
    app.use('/api/v1/categories', categoryRouter);
    app.use('/api/v1/packages', createPackageRouter(deps.db));
    app.use('/api/v1/rotations', createRotationRouter(deps.db));
    app.use('/api/v1/settings', createSettingsRouter(deps.db));
    app.use('/api/v1/users', createUserRouter(deps.db));
    app.use('/api/v1/pricing', createPricingRouter(deps.db));
    app.use('/api/v1/subscriptions', createSubscriptionRouter(deps.db));

    const { subscriptionCheckInRouter, branchQueueRouter, checkInRouter } = createCheckInRouters(deps.db);
    app.use('/api/v1/subscriptions/:id/check-in', subscriptionCheckInRouter);
    app.use('/api/v1/branches/:id/queue', branchQueueRouter);
    app.use('/api/v1/check-ins', checkInRouter);
  }

  // Error handler (must be last)
  app.use(errorHandler(logger));

  return app;
}
