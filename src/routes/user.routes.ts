import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schemaTypes from '../db/schema.js';
import { UserService } from '../services/user.service.js';
import { WhyMatrixService } from '../services/why-matrix.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { AppError } from '../utils/errors.js';
import { onboardingSchema, stepSyncSchema, whyMatrixQuerySchema } from '../validators/user.validators.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

export function createUserRouter(db: Db): Router {
  const router = Router();
  const userService = new UserService(db);
  const whyMatrixService = new WhyMatrixService(db);

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

  // PUT /api/v1/users/me/steps — R6.AC1: sync daily step count
  router.put(
    '/me/steps',
    requireAuth,
    validate(stepSyncSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await userService.syncSteps(req.user!.userId, req.body);
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /api/v1/users/me/onboarding/why-matrix — R2.AC1: fetch goal→why matrix
  router.get('/me/onboarding/why-matrix', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = whyMatrixQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        next(new AppError('Invalid or missing goal parameter', 'INVALID_GOAL', 400, parsed.error.issues));
        return;
      }
      const matrix = await whyMatrixService.getForGoal(parsed.data.goal);
      res.json(matrix);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
