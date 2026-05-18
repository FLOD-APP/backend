import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schemaTypes from '../db/schema.js';
import { AddressService } from '../services/address.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { createAddressSchema, updateAddressSchema } from '../validators/address.validators.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

export function createAddressRouter(db: Db): Router {
  const router = Router();
  const addressService = new AddressService(db);

  // R6.AC1: All routes require authentication
  router.use(requireAuth);

  // R1.AC1: GET /v1/addresses — list user's addresses
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const addresses = await addressService.list(req.user!.userId);
      res.json({ data: addresses });
    } catch (err) {
      next(err);
    }
  });

  // R2.AC1: POST /v1/addresses — create a new address
  router.post('/', validate(createAddressSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const address = await addressService.create(req.user!.userId, req.body);
      res.status(201).json({ data: address });
    } catch (err) {
      next(err);
    }
  });

  // R3.AC1: PATCH /v1/addresses/:id — update an address
  router.patch('/:id', validate(updateAddressSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const address = await addressService.update(req.user!.userId, req.params['id'] as string, req.body);
      res.json({ data: address });
    } catch (err) {
      next(err);
    }
  });

  // R4.AC1: DELETE /v1/addresses/:id — delete an address
  router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await addressService.remove(req.user!.userId, req.params['id'] as string);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  // R5.AC1: PATCH /v1/addresses/:id/default — set address as default
  router.patch('/:id/default', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const address = await addressService.setDefault(req.user!.userId, req.params['id'] as string);
      res.json({ data: address });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
