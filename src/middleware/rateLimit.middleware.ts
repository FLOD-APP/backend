import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS = 5;

export function otpRateLimit(req: Request, res: Response, next: NextFunction): void {
  const phone = (req.body as { phone?: string }).phone;
  if (!phone) {
    next();
    return;
  }

  const now = Date.now();
  const entry = store.get(phone) ?? { timestamps: [] };

  // Remove expired timestamps
  entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);

  if (entry.timestamps.length >= MAX_REQUESTS) {
    const oldestValid = entry.timestamps[0]!;
    const retryAfter = Math.ceil((oldestValid + WINDOW_MS - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    throw new AppError(
      'Too many OTP requests. Try again later.',
      'RATE_LIMIT_EXCEEDED',
      429
    );
  }

  entry.timestamps.push(now);
  store.set(phone, entry);
  next();
}

/** For testing: clear the rate limit store */
export function clearRateLimitStore(): void {
  store.clear();
}
