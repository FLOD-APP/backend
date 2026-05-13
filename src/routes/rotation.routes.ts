import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schemaTypes from '../db/schema.js';
import { RotationService } from '../services/rotation.service.js';
import { devAuthBypass } from '../middleware/devAuth.middleware.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

export function createRotationRouter(db: Db): Router {
  const router = Router();
  const rotationService = new RotationService(db);

  // GET /api/v1/rotations/:type
  router.get('/:type', devAuthBypass, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rotations = await rotationService.listByType(req.params['type'] as string);
      res.json(rotations);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/rotations/:type/:dayNumber/swaps
  router.get('/:type/:dayNumber/swaps', devAuthBypass, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dayNumber = parseInt(req.params['dayNumber'] as string, 10);
      if (isNaN(dayNumber) || dayNumber < 1 || dayNumber > 12) {
        const { AppError } = await import('../utils/errors.js');
        throw new AppError('dayNumber must be between 1 and 12', 'VALIDATION_ERROR', 400);
      }
      const swaps = await rotationService.getSwapOptions(req.params['type'] as string, dayNumber);
      res.json(swaps);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
