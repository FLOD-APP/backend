import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schemaTypes from '../db/schema.js';
import { PackageService } from '../services/package.service.js';
import { devAuthBypass } from '../middleware/devAuth.middleware.js';
import { AppError } from '../utils/errors.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

const VALID_CATEGORIES = new Set(['mixed', 'chicken', 'snack', 'sandwich', 'customer_choice']);

export function createPackageRouter(db: Db): Router {
  const router = Router();
  const packageService = new PackageService(db);

  // GET /api/v1/packages
  router.get('/', devAuthBypass, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const category = req.query['category'] as string | undefined;
      if (category && !VALID_CATEGORIES.has(category)) {
        throw new AppError(
          'Invalid category. Must be one of: mixed, chicken, snack, sandwich, customer_choice',
          'VALIDATION_ERROR',
          400,
        );
      }

      const packages = await packageService.list({ category: category || undefined });
      res.json(packages);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/packages/:id
  router.get('/:id', devAuthBypass, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pkg = await packageService.getById(req.params['id'] as string);
      res.json(pkg);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/packages/:id/schedule
  router.get('/:id/schedule', devAuthBypass, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schedule = await packageService.generateSchedule(req.params['id'] as string);
      res.json(schedule);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
