import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schemaTypes from '../db/schema.js';
import { CheckInService } from '../services/checkin.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { createCheckInSchema, updateCheckInStatusSchema } from '../validators/checkin.validators.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

export function createCheckInRouters(db: Db) {
  const checkInService = new CheckInService(db);

  // Subscription-level routes: POST /api/v1/subscriptions/:id/check-in
  const subscriptionCheckInRouter = Router({ mergeParams: true });

  subscriptionCheckInRouter.post(
    '/',
    requireAuth,
    validate(createCheckInSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { branchId } = req.body;

        const result = await checkInService.checkIn(req.params['id'] as string, req.user!.userId, branchId);
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  // Branch-level route: GET /api/v1/branches/:id/queue
  const branchQueueRouter = Router({ mergeParams: true });

  branchQueueRouter.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await checkInService.getBranchQueue(req.params['id'] as string);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Check-in management: PATCH /api/v1/check-ins/:id
  const checkInRouter = Router();

  checkInRouter.patch(
    '/:id',
    requireAuth,
    validate(updateCheckInStatusSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { status } = req.body;

        const result = await checkInService.updateStatus(req.params['id'] as string, status);
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  return { subscriptionCheckInRouter, branchQueueRouter, checkInRouter };
}
