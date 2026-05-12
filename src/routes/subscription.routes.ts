import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schemaTypes from '../db/schema.js';
import { SubscriptionService } from '../services/subscription.service.js';
import { WalletService } from '../services/wallet.service.js';
import { CollectionService } from '../services/collection.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  createSubscriptionSchema,
  pauseSubscriptionSchema,
  collectMealSchema,
  swapMealSchema,
} from '../validators/subscription.validators.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

export function createSubscriptionRouter(db: Db): Router {
  const router = Router();
  const subscriptionService = new SubscriptionService(db);
  const walletService = new WalletService(db);
  const collectionService = new CollectionService(db);

  // POST /api/v1/subscriptions — R10.AC1
  router.post(
    '/',
    requireAuth,
    validate(createSubscriptionSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { packageId, branchId, fulfilmentMode, startDate, paymentId, promoCode } = req.body;

        const result = await subscriptionService.create({
          userId: req.user!.userId,
          packageId,
          branchId,
          fulfilmentMode,
          startDate,
          paymentId,
          promoCode,
        });

        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /api/v1/subscriptions/active — R11.AC1
  router.get('/active', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await subscriptionService.getActive(req.user!.userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/subscriptions/history — R11.AC7
  router.get('/history', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await subscriptionService.getHistory(req.user!.userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/subscriptions/:id/schedule — R11.AC6
  router.get('/:id/schedule', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await subscriptionService.getSchedule(req.params['id'] as string, req.user!.userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/subscriptions/:id/pause — R11.AC2
  router.post(
    '/:id/pause',
    requireAuth,
    validate(pauseSubscriptionSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { pauseStart, pauseEnd } = req.body;

        const result = await subscriptionService.pause(
          req.params['id'] as string,
          req.user!.userId,
          pauseStart,
          pauseEnd,
        );
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /api/v1/subscriptions/:id/resume — R11.AC4
  router.post('/:id/resume', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await subscriptionService.resume(req.params['id'] as string, req.user!.userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/subscriptions/:id/collect — R12.AC1
  router.post(
    '/:id/collect',
    requireAuth,
    validate(collectMealSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { dayNumber, mealSlot } = req.body;

        const result = await collectionService.collectMeal(
          req.params['id'] as string,
          req.user!.userId,
          dayNumber,
          mealSlot,
        );
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /api/v1/subscriptions/:id/swap — R12.AC5
  router.post(
    '/:id/swap',
    requireAuth,
    validate(swapMealSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { dayNumber, mealSlot, newProductId } = req.body;

        const result = await collectionService.swapMeal(
          req.params['id'] as string,
          req.user!.userId,
          dayNumber,
          mealSlot,
          newProductId,
        );
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /api/v1/subscriptions/:id/wallet — R12.AC4
  router.get('/:id/wallet', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query['page'] as string) || 1;
      const limit = Math.min(parseInt(req.query['limit'] as string) || 20, 100);

      const result = await walletService.getWallet(req.params['id'] as string, req.user!.userId, page, limit);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
