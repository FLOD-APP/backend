import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from './auth.middleware.js';

const DEV_USER = {
  userId: '00000000-0000-0000-0000-000000000000',
  phone: '+966500000000',
};

/**
 * Development auth bypass for product catalog endpoints.
 *
 * In development mode (`NODE_ENV=development`), if no Authorization header
 * is present, attaches a synthetic dev user and allows the request through.
 * If an Authorization header IS present, delegates to `requireAuth` for
 * normal JWT verification.
 *
 * In any other environment (test, production), delegates to `requireAuth`.
 */
export function devAuthBypass(req: Request, res: Response, next: NextFunction): void {
  const isDev = process.env['NODE_ENV'] === 'development';
  const hasAuth = req.headers.authorization?.startsWith('Bearer ');

  if (isDev && !hasAuth) {
    req.user = DEV_USER;
    next();
    return;
  }

  requireAuth(req, res, next);
}
