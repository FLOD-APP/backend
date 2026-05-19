import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schemaTypes from '../db/schema.js';
import { PlanSelectionService } from '../services/plan-selection.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { createPlanSelectionSchema, updatePlanSelectionSchema } from '../validators/plan-selection.validators.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

export function createPlanSelectionRouter(db: Db): Router {
  const router = Router();
  const service = new PlanSelectionService(db);

  // All routes require authentication
  router.use(requireAuth);

  // R1.AC1: POST / — create or replace plan selection (upsert)
  router.post('/', validate(createPlanSelectionSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const selection = await service.upsert(req.user!.userId, req.body);
      res.status(201).json({ data: selection });
    } catch (err) {
      next(err);
    }
  });

  // R2.AC1: GET /me — read current user's plan selection
  router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const selection = await service.getByUserId(req.user!.userId);
      res.json({ data: selection });
    } catch (err) {
      next(err);
    }
  });

  // R3.AC1: PUT /me — full replace update
  router.put('/me', validate(updatePlanSelectionSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const selection = await service.update(req.user!.userId, req.body);
      res.json({ data: selection });
    } catch (err) {
      next(err);
    }
  });

  // R4.AC2: DELETE /me — delete plan selection
  router.delete('/me', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await service.deleteByUserId(req.user!.userId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
