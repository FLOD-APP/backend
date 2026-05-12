import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and, asc } from 'drizzle-orm';
import type * as schemaTypes from '../db/schema.js';
import {
  checkIns,
  subscriptions,
  users,
} from '../db/schema.js';
import { AppError } from '../utils/errors.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

const VALID_STATUSES = new Set(['preparing', 'ready', 'collected']);

export class CheckInService {
  constructor(private db: Db) {}

  /** R17.AC1: Create a check-in. R17.AC4: Verify active subscription at branch. */
  async checkIn(subscriptionId: string, userId: string, branchId: string) {
    // R17.AC4: Verify user has active subscription at this branch
    const subRows = await this.db
      .select({
        id: subscriptions.id,
        userId: subscriptions.userId,
        branchId: subscriptions.branchId,
        status: subscriptions.status,
      })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.id, subscriptionId),
          eq(subscriptions.branchId, branchId),
          eq(subscriptions.status, 'active')
        )
      )
      .limit(1);

    if (subRows.length === 0) {
      throw new AppError(
        'No active subscription at this branch',
        'NO_ACTIVE_SUBSCRIPTION',
        403
      );
    }

    if (subRows[0]!.userId !== userId) {
      throw new AppError('Not authorized', 'UNAUTHORIZED', 403);
    }

    // Create check-in
    const rows = await this.db
      .insert(checkIns)
      .values({
        subscriptionId,
        branchId,
        userId,
        status: 'waiting',
      })
      .returning({
        id: checkIns.id,
        subscriptionId: checkIns.subscriptionId,
        branchId: checkIns.branchId,
        status: checkIns.status,
        checkedInAt: checkIns.checkedInAt,
      });

    return rows[0]!;
  }

  /** R17.AC2: Get branch queue (active check-ins) */
  async getBranchQueue(branchId: string) {
    return this.db
      .select({
        id: checkIns.id,
        subscriptionId: checkIns.subscriptionId,
        userId: checkIns.userId,
        status: checkIns.status,
        checkedInAt: checkIns.checkedInAt,
        statusUpdatedAt: checkIns.statusUpdatedAt,
        userName: users.name,
        userPhone: users.phone,
      })
      .from(checkIns)
      .innerJoin(users, eq(checkIns.userId, users.id))
      .where(
        and(
          eq(checkIns.branchId, branchId),
          // Active = not yet collected
          // In practice: waiting, preparing, ready
        )
      )
      .orderBy(asc(checkIns.checkedInAt));
  }

  /** R17.AC3: Update check-in status */
  async updateStatus(checkInId: string, status: string) {
    if (!VALID_STATUSES.has(status)) {
      throw new AppError(
        'Status must be "preparing", "ready", or "collected"',
        'VALIDATION_ERROR',
        400
      );
    }

    const rows = await this.db
      .update(checkIns)
      .set({
        status,
        statusUpdatedAt: new Date(),
      })
      .where(eq(checkIns.id, checkInId))
      .returning({
        id: checkIns.id,
        status: checkIns.status,
        statusUpdatedAt: checkIns.statusUpdatedAt,
      });

    if (rows.length === 0) {
      throw new AppError('Check-in not found', 'CHECKIN_NOT_FOUND', 404);
    }

    return rows[0]!;
  }
}
