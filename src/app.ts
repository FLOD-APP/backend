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

  // API v1 routes — mounted at both /api/v1 (legacy) and /v1 (FE canonical)
  if (deps.db) {
    const mountRoutes = (prefix: string) => {
      app.use(`${prefix}/auth`, createAuthRouter(deps.db!));
      app.use(`${prefix}/branches`, createBranchRouter(deps.db!));

      const { productRouter, categoryRouter } = createProductRouter(deps.db!);
      app.use(`${prefix}/products`, productRouter);
      app.use(`${prefix}/categories`, categoryRouter);
      app.use(`${prefix}/packages`, createPackageRouter(deps.db!));
      app.use(`${prefix}/rotations`, createRotationRouter(deps.db!));
      app.use(`${prefix}/settings`, createSettingsRouter(deps.db!));
      app.use(`${prefix}/users`, createUserRouter(deps.db!));
      app.use(`${prefix}/pricing`, createPricingRouter(deps.db!));
      app.use(`${prefix}/subscriptions`, createSubscriptionRouter(deps.db!));

      const { subscriptionCheckInRouter, branchQueueRouter, checkInRouter } = createCheckInRouters(deps.db!);
      app.use(`${prefix}/subscriptions/:id/check-in`, subscriptionCheckInRouter);
      app.use(`${prefix}/branches/:id/queue`, branchQueueRouter);
      app.use(`${prefix}/check-ins`, checkInRouter);
    };

    mountRoutes('/api/v1');
    mountRoutes('/v1');
  }

  // Error handler (must be last)
  app.use(errorHandler(logger));

  return app;
}
