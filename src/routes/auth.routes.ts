import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schemaTypes from '../db/schema.js';
import { AuthService } from '../services/auth.service.js';
import { otpRequestSchema, otpVerifySchema, refreshSchema } from '../validators/auth.validators.js';
import { validate } from '../middleware/validate.middleware.js';
import { otpRateLimit } from '../middleware/rateLimit.middleware.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

export function createAuthRouter(db: Db): Router {
  const router = Router();
  const authService = new AuthService(db);

  // POST /api/v1/auth/otp/request
  router.post(
    '/otp/request',
    otpRateLimit,
    validate(otpRequestSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await authService.requestOtp(req.body.phone);

        // V0: Log OTP to console (no SMS)
        console.log(`[OTP] ${req.body.phone}: ${result.otp}`);

        res.json({ sent: result.sent });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /api/v1/auth/otp/verify
  router.post('/otp/verify', validate(otpVerifySchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.verifyOtp(req.body.phone, req.body.code);

      res.json({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/auth/refresh
  router.post('/refresh', validate(refreshSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.refresh(req.body.refreshToken);

      res.json({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
