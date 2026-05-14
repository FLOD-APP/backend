/**
 * Foodics sync retry service.
 *
 * Manages the retry queue for failed Foodics API syncs.
 * Uses the `foodics_sync_log` table for audit trail and retry scheduling.
 *
 * Retry schedule (exponential backoff):
 *   Attempt 1: immediate
 *   Attempt 2: +1 minute
 *   Attempt 3: +5 minutes
 *   Attempt 4: +15 minutes
 *   Attempt 5: +1 hour
 *
 * After max attempts, the sync is marked as 'failed' permanently
 * and requires manual intervention via admin API.
 *
 * Design: Foodics sync is EVENTUAL, not transactional.
 * FLOD database is the source of truth. Foodics is kept in
 * sync via best-effort + retry. Foodics downtime does NOT
 * block meal collections.
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and, sql, lt, inArray } from 'drizzle-orm';
import type * as schemaTypes from '../../db/schema.js';
import { foodicsSyncLog, subscriptionDailyMeals } from '../../db/schema.js';
import { logger as rootLogger } from '../../middleware/logger.middleware.js';
import type { FoodicsClient } from './foodics.client.js';
import { FoodicsApiError } from './foodics.client.js';
import { buildFoodicsOrder } from './foodics-order.builder.js';
import type { FlodMealCollectionInput, FoodicsSyncStatus } from './foodics.types.js';
import { foodicsOrderSchema } from './foodics.validators.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

const logger = rootLogger.child({ module: 'foodics-sync' });

/** Retry delay schedule in milliseconds (indexed by attempt number, 0-based) */
const RETRY_DELAYS_MS = [
  0, // attempt 1: immediate
  60_000, // attempt 2: 1 minute
  300_000, // attempt 3: 5 minutes
  900_000, // attempt 4: 15 minutes
  3_600_000, // attempt 5: 1 hour
] as const;

export interface FoodicsSyncConfig {
  /** Maximum retry attempts before permanent failure */
  maxRetryAttempts: number;
  /** Whether Foodics sync is enabled (feature flag) */
  syncEnabled: boolean;
}

const DEFAULT_CONFIG: FoodicsSyncConfig = {
  maxRetryAttempts: 5,
  syncEnabled: false,
};

export class FoodicsSyncService {
  private readonly config: FoodicsSyncConfig;

  constructor(
    private readonly db: Db,
    private readonly client: FoodicsClient | null,
    config?: Partial<FoodicsSyncConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Attempt to sync a meal collection to Foodics.
   * If sync fails, creates a retry entry in the sync log.
   *
   * Called after a successful meal collection in CollectionService.
   */
  async syncMealCollection(input: FlodMealCollectionInput): Promise<{
    synced: boolean;
    foodicsOrderId?: string;
    syncLogId?: string;
  }> {
    if (!this.config.syncEnabled) {
      logger.debug({ mealId: input.mealId }, 'Foodics sync disabled, skipping');
      return { synced: false };
    }

    if (!this.client) {
      logger.warn({ mealId: input.mealId }, 'Foodics client not configured, skipping sync');
      return { synced: false };
    }

    const payload = buildFoodicsOrder(input);

    try {
      const { data: order } = await this.client.post(
        '/orders',
        payload.request,
        foodicsOrderSchema.transform((o) => ({ data: o })),
      );

      // Update meal record with Foodics order ID
      await this.db
        .update(subscriptionDailyMeals)
        .set({
          foodicsOrderId: order.id,
          foodicsSyncedAt: new Date(),
          foodicsSyncStatus: 'synced' as FoodicsSyncStatus,
        })
        .where(eq(subscriptionDailyMeals.id, input.mealId));

      // Log success
      await this.insertSyncLog({
        mealId: input.mealId,
        status: 'synced',
        foodicsOrderId: order.id,
        attempt: 1,
        requestPayload: payload.request,
      });

      logger.info({ mealId: input.mealId, foodicsOrderId: order.id }, 'Foodics order synced successfully');

      return { synced: true, foodicsOrderId: order.id };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const retryable = err instanceof FoodicsApiError ? err.retryable : true;

      logger.error({ mealId: input.mealId, error: errorMsg, retryable }, 'Foodics order sync failed');

      // Update meal sync status
      await this.db
        .update(subscriptionDailyMeals)
        .set({
          foodicsSyncStatus: (retryable ? 'retrying' : 'failed') as FoodicsSyncStatus,
        })
        .where(eq(subscriptionDailyMeals.id, input.mealId));

      // Create retry entry
      const nextRetryAt = this.calculateNextRetry(1);
      const syncLogRows = await this.insertSyncLog({
        mealId: input.mealId,
        status: retryable ? 'retrying' : 'failed',
        attempt: 1,
        errorMessage: errorMsg,
        requestPayload: payload.request,
        nextRetryAt: retryable ? nextRetryAt : undefined,
      });

      return { synced: false, syncLogId: syncLogRows };
    }
  }

  /**
   * Process the retry queue — called periodically (e.g. every minute via cron/setInterval).
   * Picks up entries where next_retry_at <= now and retries them.
   */
  async processRetryQueue(): Promise<{ processed: number; succeeded: number; failed: number }> {
    if (!this.config.syncEnabled || !this.client) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    const now = new Date();

    // Get entries ready for retry
    const entries = await this.db
      .select()
      .from(foodicsSyncLog)
      .where(and(inArray(foodicsSyncLog.status, ['retrying']), lt(foodicsSyncLog.nextRetryAt, now)))
      .limit(10); // Process in small batches to respect rate limits

    let succeeded = 0;
    let failed = 0;

    for (const entry of entries) {
      const attempt = entry.attempt + 1;
      const payload = entry.requestPayload as Record<string, unknown>;

      try {
        const response = await this.client.post('/orders', payload);
        const order = response as { id: string };

        // Update sync log
        await this.db
          .update(foodicsSyncLog)
          .set({
            status: 'synced',
            foodicsOrderId: order.id,
            attempt,
            errorMessage: null,
            nextRetryAt: null,
            updatedAt: now,
          })
          .where(eq(foodicsSyncLog.id, entry.id));

        // Update meal record
        await this.db
          .update(subscriptionDailyMeals)
          .set({
            foodicsOrderId: order.id,
            foodicsSyncedAt: now,
            foodicsSyncStatus: 'synced' as FoodicsSyncStatus,
          })
          .where(eq(subscriptionDailyMeals.id, entry.mealId));

        logger.info(
          { syncLogId: entry.id, mealId: entry.mealId, foodicsOrderId: order.id, attempt },
          'Foodics retry succeeded',
        );

        succeeded++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const isMaxAttempts = attempt >= this.config.maxRetryAttempts;
        const status: FoodicsSyncStatus = isMaxAttempts ? 'failed' : 'retrying';

        await this.db
          .update(foodicsSyncLog)
          .set({
            status,
            attempt,
            errorMessage: errorMsg,
            nextRetryAt: isMaxAttempts ? null : this.calculateNextRetry(attempt),
            updatedAt: now,
          })
          .where(eq(foodicsSyncLog.id, entry.id));

        // Update meal status
        await this.db
          .update(subscriptionDailyMeals)
          .set({ foodicsSyncStatus: status })
          .where(eq(subscriptionDailyMeals.id, entry.mealId));

        logger.warn(
          { syncLogId: entry.id, mealId: entry.mealId, attempt, error: errorMsg, permanent: isMaxAttempts },
          isMaxAttempts ? 'Foodics retry exhausted, marking as failed' : 'Foodics retry failed, will retry again',
        );

        failed++;
      }
    }

    return { processed: entries.length, succeeded, failed };
  }

  /**
   * Get sync status summary for admin monitoring.
   */
  async getSyncStatus(): Promise<{
    pending: number;
    synced: number;
    retrying: number;
    failed: number;
  }> {
    const rows = await this.db.execute(
      sql`SELECT status, count(*)::int as count FROM foodics_sync_log GROUP BY status`,
    );

    const result = { pending: 0, synced: 0, retrying: 0, failed: 0 };
    for (const row of rows) {
      const status = row['status'] as keyof typeof result;
      const count = row['count'] as number;
      if (status in result) {
        result[status] = count;
      }
    }

    return result;
  }

  /**
   * Manually retry a specific failed sync.
   */
  async retryById(syncLogId: string): Promise<boolean> {
    await this.db
      .update(foodicsSyncLog)
      .set({
        status: 'retrying',
        nextRetryAt: new Date(), // Retry immediately
        updatedAt: new Date(),
      })
      .where(and(eq(foodicsSyncLog.id, syncLogId), eq(foodicsSyncLog.status, 'failed')));

    return true;
  }

  // ── Private helpers ─────────────────────────────────────────────

  private calculateNextRetry(currentAttempt: number): Date {
    const delayMs = RETRY_DELAYS_MS[Math.min(currentAttempt, RETRY_DELAYS_MS.length - 1)] ?? 3_600_000;
    return new Date(Date.now() + delayMs);
  }

  private async insertSyncLog(input: {
    mealId: string;
    status: FoodicsSyncStatus;
    foodicsOrderId?: string;
    attempt: number;
    errorMessage?: string;
    requestPayload?: unknown;
    nextRetryAt?: Date;
  }): Promise<string> {
    const rows = await this.db
      .insert(foodicsSyncLog)
      .values({
        mealId: input.mealId,
        status: input.status,
        foodicsOrderId: input.foodicsOrderId ?? null,
        attempt: input.attempt,
        errorMessage: input.errorMessage ?? null,
        requestPayload: input.requestPayload ?? null,
        nextRetryAt: input.nextRetryAt ?? null,
      })
      .returning({ id: foodicsSyncLog.id });

    return rows[0]!.id;
  }
}
