import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { AppError } from '../utils/errors.js';

/**
 * Express middleware that validates req.body against a Zod schema.
 * On success, replaces req.body with the parsed (typed) data.
 * On failure, throws AppError with VALIDATION_ERROR code and Zod issues as details.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      next(new AppError('Validation failed', 'VALIDATION_ERROR', 400, parsed.error.issues));
      return;
    }
    req.body = parsed.data;
    next();
  };
}
