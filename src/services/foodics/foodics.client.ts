/**
 * Foodics API v5 HTTP client.
 *
 * Features:
 * - Token bucket rate limiting (30 req/min per token, per Foodics docs)
 * - Exponential backoff on 429 and 5xx
 * - Pino structured logging
 * - Runtime response validation via Zod
 * - Native fetch (Node 20+)
 */

import type { z } from 'zod';
import { logger as rootLogger } from '../../middleware/logger.middleware.js';
import type { FoodicsErrorResponse } from './foodics.types.js';

const logger = rootLogger.child({ module: 'foodics-client' });

// ── Configuration ───────────────────────────────────────────────────

export interface FoodicsClientConfig {
  /** Base URL (e.g. https://api.foodics.com/v5 or https://api-sandbox.foodics.com/v5) */
  baseUrl: string;
  /** Bearer access token */
  accessToken: string;
  /** Max requests per minute (Foodics limit: 30 per token per IP) */
  rateLimitPerMinute?: number;
  /** Max retry attempts on transient failures */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff */
  baseRetryDelayMs?: number;
}

const DEFAULTS = {
  rateLimitPerMinute: 30,
  maxRetries: 3,
  baseRetryDelayMs: 1000,
} as const;

// ── Token Bucket Rate Limiter ───────────────────────────────────────

class TokenBucket {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillIntervalMs: number;
  private lastRefill: number;

  constructor(maxPerMinute: number) {
    this.maxTokens = maxPerMinute;
    this.tokens = maxPerMinute;
    this.refillIntervalMs = 60_000 / maxPerMinute; // ~2s per token at 30/min
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens > 0) {
      this.tokens--;
      return;
    }
    // Wait for next token
    const waitMs = this.refillIntervalMs - (Date.now() - this.lastRefill);
    if (waitMs > 0) {
      logger.debug({ waitMs }, 'Rate limit: waiting for token');
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    this.refill();
    this.tokens = Math.max(0, this.tokens - 1);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = Math.floor(elapsed / this.refillIntervalMs);
    if (newTokens > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
      this.lastRefill = now;
    }
  }
}

// ── Error Types ─────────────────────────────────────────────────────

export class FoodicsApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly foodicsErrors?: Record<string, string[]>,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'FoodicsApiError';
    Object.setPrototypeOf(this, FoodicsApiError.prototype);
  }
}

export class FoodicsValidationError extends Error {
  constructor(
    message: string,
    public readonly zodErrors: z.ZodError,
  ) {
    super(message);
    this.name = 'FoodicsValidationError';
    Object.setPrototypeOf(this, FoodicsValidationError.prototype);
  }
}

// ── Client ──────────────────────────────────────────────────────────

export class FoodicsClient {
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly bucket: TokenBucket;
  private readonly maxRetries: number;
  private readonly baseRetryDelayMs: number;

  constructor(config: FoodicsClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.accessToken = config.accessToken;
    this.bucket = new TokenBucket(config.rateLimitPerMinute ?? DEFAULTS.rateLimitPerMinute);
    this.maxRetries = config.maxRetries ?? DEFAULTS.maxRetries;
    this.baseRetryDelayMs = config.baseRetryDelayMs ?? DEFAULTS.baseRetryDelayMs;
  }

  // ── Public Methods ──────────────────────────────────────────────

  async get<T>(path: string, schema?: z.ZodType<T>, params?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(path, params);
    return this.request('GET', url, undefined, schema);
  }

  async post<T>(path: string, body: unknown, schema?: z.ZodType<T>): Promise<T> {
    const url = this.buildUrl(path);
    return this.request('POST', url, body, schema);
  }

  async put<T>(path: string, body: unknown, schema?: z.ZodType<T>): Promise<T> {
    const url = this.buildUrl(path);
    return this.request('PUT', url, body, schema);
  }

  async delete(path: string): Promise<void> {
    const url = this.buildUrl(path);
    await this.request('DELETE', url);
  }

  // ── Internal ────────────────────────────────────────────────────

  private buildUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }

  private async request<T>(
    method: string,
    url: string,
    body?: unknown,
    schema?: z.ZodType<T>,
    attempt: number = 1,
  ): Promise<T> {
    await this.bucket.acquire();

    const startMs = Date.now();
    const reqId = Math.random().toString(36).slice(2, 8);

    logger.debug({ reqId, method, url, attempt }, 'Foodics API request');

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Request-Id': reqId,
    };

    const init: RequestInit = {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    };

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      logger.error({ reqId, method, url, err: (err as Error).message, attempt }, 'Foodics API network error');
      if (attempt <= this.maxRetries) {
        return this.retryAfterDelay(method, url, body, schema, attempt);
      }
      throw new FoodicsApiError(`Network error: ${(err as Error).message}`, 0, undefined, true);
    }

    const durationMs = Date.now() - startMs;

    // Handle rate limit (429)
    if (response.status === 429) {
      logger.warn({ reqId, method, url, durationMs, attempt }, 'Foodics API rate limited (429)');
      if (attempt <= this.maxRetries) {
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '0', 10);
        const delayMs = retryAfter > 0 ? retryAfter * 1000 : this.backoffDelay(attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return this.request(method, url, body, schema, attempt + 1);
      }
      throw new FoodicsApiError('Rate limited', 429, undefined, true);
    }

    // Handle server errors (5xx)
    if (response.status >= 500) {
      logger.error({ reqId, method, url, status: response.status, durationMs, attempt }, 'Foodics API server error');
      if (attempt <= this.maxRetries) {
        return this.retryAfterDelay(method, url, body, schema, attempt);
      }
      throw new FoodicsApiError(`Server error: ${response.status}`, response.status, undefined, true);
    }

    // Handle client errors (4xx, non-429)
    if (!response.ok) {
      let errorBody: FoodicsErrorResponse | undefined;
      try {
        errorBody = (await response.json()) as FoodicsErrorResponse;
      } catch {
        // Failed to parse error body — proceed with generic error
      }
      logger.warn(
        { reqId, method, url, status: response.status, durationMs, errors: errorBody?.errors },
        'Foodics API client error',
      );
      throw new FoodicsApiError(
        errorBody?.message ?? `HTTP ${response.status}`,
        response.status,
        errorBody?.errors,
        false,
      );
    }

    logger.debug({ reqId, method, url, status: response.status, durationMs }, 'Foodics API response OK');

    // DELETE returns no body
    if (response.status === 204 || method === 'DELETE') {
      return undefined as T;
    }

    const data = await response.json();

    // Validate with Zod if schema provided
    if (schema) {
      const result = schema.safeParse(data);
      if (!result.success) {
        logger.error(
          { reqId, method, url, zodErrors: result.error.flatten() },
          'Foodics API response validation failed',
        );
        throw new FoodicsValidationError('Foodics API response does not match expected schema', result.error);
      }
      return result.data;
    }

    return data as T;
  }

  private async retryAfterDelay<T>(
    method: string,
    url: string,
    body: unknown | undefined,
    schema: z.ZodType<T> | undefined,
    attempt: number,
  ): Promise<T> {
    const delayMs = this.backoffDelay(attempt);
    logger.info({ attempt, delayMs, method, url }, 'Retrying Foodics API request');
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return this.request(method, url, body, schema, attempt + 1);
  }

  private backoffDelay(attempt: number): number {
    // Exponential backoff with jitter: base * 2^(attempt-1) + random 0-500ms
    return this.baseRetryDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 500);
  }
}
