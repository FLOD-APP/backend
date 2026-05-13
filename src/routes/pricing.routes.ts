import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schemaTypes from '../db/schema.js';
import { PricingService } from '../services/pricing.service.js';
import { devAuthBypass } from '../middleware/devAuth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { calculatePricingSchema, validatePromoSchema } from '../validators/pricing.validators.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

export function createPricingRouter(db: Db): Router {
  const router = Router();
  const pricingService = new PricingService(db);

  // POST /api/v1/pricing/calculate — R9.AC2
  router.post(
    '/calculate',
    devAuthBypass,
    validate(calculatePricingSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { packageId, promoCode } = req.body;
        const userId = req.user!.userId;
        const result = await pricingService.calculateFullPricing(packageId, userId, promoCode);
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /api/v1/pricing/validate-promo — R9.AC7
  router.post(
    '/validate-promo',
    devAuthBypass,
    validate(validatePromoSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { code } = req.body;
        const result = await pricingService.validatePromo(code);
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
