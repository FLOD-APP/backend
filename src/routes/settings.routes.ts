import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schemaTypes from '../db/schema.js';
import { SettingsService } from '../services/settings.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { AppError } from '../utils/errors.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

export function createSettingsRouter(db: Db): Router {
  const router = Router();
  const settingsService = new SettingsService(db);

  // GET /api/v1/settings
  router.get('/', requireAuth, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await settingsService.getAll();
      res.json(settings);
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/v1/settings/:key
  router.patch('/:key', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { value } = req.body as { value?: string };
      if (typeof value !== 'string') {
        throw new AppError('Field "value" is required and must be a string', 'VALIDATION_ERROR', 400);
      }

      const setting = await settingsService.update(req.params['key'] as string, value, req.user?.userId);
      res.json(setting);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
