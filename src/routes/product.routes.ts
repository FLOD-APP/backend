import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schemaTypes from '../db/schema.js';
import { ProductService } from '../services/product.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { AppError } from '../utils/errors.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

const VALID_TIERS = new Set(['base', 'subscription', 'express_base', 'express_subscription', 'app']);

export function createProductRouter(db: Db): { productRouter: Router; categoryRouter: Router } {
  const productRouter = Router();
  const categoryRouter = Router();
  const productService = new ProductService(db);

  // GET /api/v1/categories
  categoryRouter.get('/', requireAuth, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const categories = await productService.listCategories();
      res.json(categories);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/products
  productRouter.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tier = req.query['tier'] as string | undefined;
      if (!tier || !VALID_TIERS.has(tier)) {
        throw new AppError(
          'Query parameter "tier" is required and must be one of: base, subscription, express_base, express_subscription, app',
          'VALIDATION_ERROR',
          400
        );
      }

      const categoryId = req.query['category_id'] as string | undefined;
      const inSubscription = req.query['in_subscription'] === 'true';

      const products = await productService.listProducts({
        tier,
        categoryId: categoryId || undefined,
        inSubscription: inSubscription || undefined,
      });

      res.json(products);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/products/:id
  productRouter.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const product = await productService.getById(req.params['id'] as string);
      res.json(product);
    } catch (err) {
      next(err);
    }
  });

  return { productRouter, categoryRouter };
}
