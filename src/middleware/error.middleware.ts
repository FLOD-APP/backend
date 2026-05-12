import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import type { Logger } from 'pino';

export function errorHandler(logger: Logger) {
  return (err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: err.message,
        code: err.code,
        ...(err.details != null ? { details: err.details } : {}),
      });
      return;
    }

    logger.error({ err }, 'Unhandled error');

    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  };
}
