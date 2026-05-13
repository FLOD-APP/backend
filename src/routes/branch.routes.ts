import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schemaTypes from '../db/schema.js';
import { BranchService } from '../services/branch.service.js';
import { devAuthBypass } from '../middleware/devAuth.middleware.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

export function createBranchRouter(db: Db): Router {
  const router = Router();
  const branchService = new BranchService(db);

  // GET /api/v1/branches
  router.get('/', devAuthBypass, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stage0Param = req.query['stage0'];
      const stage0 = stage0Param === 'true';
      const branches = await branchService.list({ stage0: stage0 || undefined });
      res.json(branches);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/branches/:id
  router.get('/:id', devAuthBypass, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const branch = await branchService.getById(req.params['id'] as string);
      res.json(branch);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
