import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, desc, sql } from 'drizzle-orm';
import type * as schemaTypes from '../db/schema.js';
import {
  subscriptions,
  walletTransactions,
} from '../db/schema.js';
import { AppError } from '../utils/errors.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

export interface WalletTransactionInput {
  subscriptionId: string;
  type: string;
  amount: number; // positive for credits, negative for debits
  description?: string;
  mealId?: string;
}

export class WalletService {
  constructor(private db: Db) {}

  /** R12.AC4: Get wallet balance and transaction history */
  async getWallet(subscriptionId: string, userId: string, page: number = 1, limit: number = 20) {
    // Verify ownership
    const subRows = await this.db
      .select({
        id: subscriptions.id,
        userId: subscriptions.userId,
        walletBalance: subscriptions.walletBalance,
      })
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId))
      .limit(1);

    if (subRows.length === 0) {
      throw new AppError('Subscription not found', 'SUBSCRIPTION_NOT_FOUND', 404);
    }

    if (subRows[0]!.userId !== userId) {
      throw new AppError('Not authorized', 'UNAUTHORIZED', 403);
    }

    const offset = (page - 1) * limit;

    const transactions = await this.db
      .select({
        id: walletTransactions.id,
        type: walletTransactions.type,
        amount: walletTransactions.amount,
        balanceAfter: walletTransactions.balanceAfter,
        description: walletTransactions.description,
        mealId: walletTransactions.mealId,
        createdAt: walletTransactions.createdAt,
      })
      .from(walletTransactions)
      .where(eq(walletTransactions.subscriptionId, subscriptionId))
      .orderBy(desc(walletTransactions.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count for pagination
    const countRows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(walletTransactions)
      .where(eq(walletTransactions.subscriptionId, subscriptionId));

    return {
      walletBalance: subRows[0]!.walletBalance,
      transactions,
      pagination: {
        page,
        limit,
        total: countRows[0]!.count,
      },
    };
  }

  /**
   * Deduct or credit the wallet within a transaction.
   * Uses FOR UPDATE to prevent race conditions (design: concurrency with FOR UPDATE).
   * Accepts either a Drizzle DB instance or a transaction object.
   */
  async transact(tx: Pick<Db, 'execute' | 'insert' | 'update'>, input: WalletTransactionInput): Promise<{ newBalance: string }> {
    // Lock the subscription row for update
    const lockRows = await tx.execute(
      sql`SELECT wallet_balance FROM subscriptions WHERE id = ${input.subscriptionId}::uuid FOR UPDATE`
    );

    if (lockRows.length === 0) {
      throw new AppError('Subscription not found', 'SUBSCRIPTION_NOT_FOUND', 404);
    }

    const currentBalance = parseFloat(lockRows[0]!['wallet_balance'] as string);
    const newBalance = Math.round((currentBalance + input.amount) * 100) / 100;

    if (newBalance < 0) {
      throw new AppError('Insufficient wallet balance', 'INSUFFICIENT_BALANCE', 400);
    }

    // Insert transaction
    await tx.insert(walletTransactions).values({
      subscriptionId: input.subscriptionId,
      type: input.type,
      amount: String(input.amount),
      balanceAfter: String(newBalance),
      description: input.description,
      mealId: input.mealId,
    });

    // Update subscription balance
    await tx
      .update(subscriptions)
      .set({
        walletBalance: String(newBalance),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, input.subscriptionId));

    return { newBalance: String(newBalance) };
  }
}
