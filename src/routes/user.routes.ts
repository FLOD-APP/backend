import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schemaTypes from '../db/schema.js';
import { UserService } from '../services/user.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { onboardingSchema } from '../validators/user.validators.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

export function createUserRouter(db: Db): Router {
  const router = Router();
  const userService = new UserService(db);

  // GET /api/v1/users/me
  router.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = await userService.getProfile(req.user!.userId);
      res.json(profile);
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/v1/users/me
  router.patch('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, email, languagePreference } = req.body as {
        name?: string;
        email?: string;
        languagePreference?: string;
      };

      const profile = await userService.updateProfile(req.user!.userId, {
        name,
        email,
        languagePreference,
      });
      res.json(profile);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/users/me/onboarding — R2.AC1: first-time onboarding submission
  router.post(
    '/me/onboarding',
    requireAuth,
    validate(onboardingSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const profile = await userService.saveOnboarding(req.user!.userId, req.body);
        res.json(profile);
      } catch (err) {
        next(err);
      }
    },
  );

  // PUT /api/v1/users/me/onboarding — R4.AC1: update onboarding data
  router.put(
    '/me/onboarding',
    requireAuth,
    validate(onboardingSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const profile = await userService.saveOnboarding(req.user!.userId, req.body);
        res.json(profile);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
