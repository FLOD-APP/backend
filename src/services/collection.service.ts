import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and, lt, sql } from 'drizzle-orm';
import type * as schemaTypes from '../db/schema.js';
import { subscriptions, subscriptionDailyMeals, products, productPrices } from '../db/schema.js';
import { AppError } from '../utils/errors.js';
import { WalletService } from './wallet.service.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

export class CollectionService {
  private walletService: WalletService;

  constructor(private db: Db) {
    this.walletService = new WalletService(db);
  }

  /**
   * R12.AC1: Collect a meal — mark as collected, deduct from wallet.
   * R12.AC2: Reject if already collected (409).
   * R12.AC3: Missed days before this one are auto-consumed.
   */
  async collectMeal(subscriptionId: string, userId: string, dayNumber: number, mealSlot: number) {
    // Verify ownership
    const subRows = await this.db
      .select({ id: subscriptions.id, userId: subscriptions.userId, status: subscriptions.status })
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId))
      .limit(1);

    if (subRows.length === 0) {
      throw new AppError('Subscription not found', 'SUBSCRIPTION_NOT_FOUND', 404);
    }
    if (subRows[0]!.userId !== userId) {
      throw new AppError('Not authorized', 'UNAUTHORIZED', 403);
    }

    // Get the meal record
    const mealRows = await this.db
      .select({
        id: subscriptionDailyMeals.id,
        isCollected: subscriptionDailyMeals.isCollected,
        priceInclVat: subscriptionDailyMeals.priceInclVat,
      })
      .from(subscriptionDailyMeals)
      .where(
        and(
          eq(subscriptionDailyMeals.subscriptionId, subscriptionId),
          eq(subscriptionDailyMeals.dayNumber, dayNumber),
          eq(subscriptionDailyMeals.mealSlot, mealSlot),
        ),
      )
      .limit(1);

    if (mealRows.length === 0) {
      throw new AppError('Meal not found for this day/slot', 'MEAL_NOT_FOUND', 404);
    }

    // R12.AC2: Already collected
    if (mealRows[0]!.isCollected) {
      throw new AppError('Meal already collected', 'MEAL_ALREADY_COLLECTED', 409);
    }

    const mealPrice = parseFloat(mealRows[0]!.priceInclVat);

    return this.db.transaction(async (tx) => {
      // R12.AC3: Mark missed days as consumed
      const missedMeals = await tx
        .select({
          id: subscriptionDailyMeals.id,
          dayNumber: subscriptionDailyMeals.dayNumber,
          mealSlot: subscriptionDailyMeals.mealSlot,
          priceInclVat: subscriptionDailyMeals.priceInclVat,
        })
        .from(subscriptionDailyMeals)
        .where(
          and(
            eq(subscriptionDailyMeals.subscriptionId, subscriptionId),
            lt(subscriptionDailyMeals.dayNumber, dayNumber),
            eq(subscriptionDailyMeals.isCollected, false),
          ),
        );

      for (const missed of missedMeals) {
        await tx
          .update(subscriptionDailyMeals)
          .set({ isCollected: true, collectedAt: new Date() })
          .where(eq(subscriptionDailyMeals.id, missed.id));

        await this.walletService.transact(tx, {
          subscriptionId,
          type: 'meal_deduction',
          amount: -parseFloat(missed.priceInclVat),
          description: `Missed day ${missed.dayNumber} slot ${missed.mealSlot}`,
          mealId: missed.id,
        });
      }

      // R12.AC1: Mark this meal as collected
      await tx
        .update(subscriptionDailyMeals)
        .set({ isCollected: true, collectedAt: new Date() })
        .where(eq(subscriptionDailyMeals.id, mealRows[0]!.id));

      // Deduct from wallet
      const { newBalance } = await this.walletService.transact(tx, {
        subscriptionId,
        type: 'meal_deduction',
        amount: -mealPrice,
        description: `Collected day ${dayNumber} slot ${mealSlot}`,
        mealId: mealRows[0]!.id,
      });

      return {
        mealId: mealRows[0]!.id,
        dayNumber,
        mealSlot,
        priceDeducted: mealPrice,
        missedMealsConsumed: missedMeals.length,
        walletBalance: newBalance,
      };
    });
  }

  /**
   * R12.AC5: Swap a meal to a different product.
   * R12.AC6: Reject if insufficient balance.
   */
  async swapMeal(subscriptionId: string, userId: string, dayNumber: number, mealSlot: number, newProductId: string) {
    // Verify ownership
    const subRows = await this.db
      .select({ id: subscriptions.id, userId: subscriptions.userId })
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId))
      .limit(1);

    if (subRows.length === 0) {
      throw new AppError('Subscription not found', 'SUBSCRIPTION_NOT_FOUND', 404);
    }
    if (subRows[0]!.userId !== userId) {
      throw new AppError('Not authorized', 'UNAUTHORIZED', 403);
    }

    // Get current meal
    const mealRows = await this.db
      .select({
        id: subscriptionDailyMeals.id,
        productId: subscriptionDailyMeals.productId,
        priceInclVat: subscriptionDailyMeals.priceInclVat,
        isCollected: subscriptionDailyMeals.isCollected,
      })
      .from(subscriptionDailyMeals)
      .where(
        and(
          eq(subscriptionDailyMeals.subscriptionId, subscriptionId),
          eq(subscriptionDailyMeals.dayNumber, dayNumber),
          eq(subscriptionDailyMeals.mealSlot, mealSlot),
        ),
      )
      .limit(1);

    if (mealRows.length === 0) {
      throw new AppError('Meal not found', 'MEAL_NOT_FOUND', 404);
    }

    if (mealRows[0]!.isCollected) {
      throw new AppError('Cannot swap a collected meal', 'MEAL_ALREADY_COLLECTED', 400);
    }

    // Get new product with subscription price
    const newProductRows = await this.db
      .select({
        id: products.id,
        nameEn: products.nameEn,
        categoryId: products.categoryId,
        priceInclVat: productPrices.priceInclVat,
      })
      .from(products)
      .innerJoin(productPrices, eq(products.id, productPrices.productId))
      .where(
        and(
          eq(products.id, newProductId),
          eq(products.isActive, true),
          eq(productPrices.tier, 'subscription'),
          sql`${productPrices.branchId} IS NULL`,
          sql`${productPrices.effectiveFrom} <= CURRENT_DATE`,
          sql`(${productPrices.effectiveTo} IS NULL OR ${productPrices.effectiveTo} > CURRENT_DATE)`,
        ),
      )
      .limit(1);

    if (newProductRows.length === 0) {
      throw new AppError('New product not found or not available', 'PRODUCT_NOT_FOUND', 404);
    }

    const currentPrice = parseFloat(mealRows[0]!.priceInclVat);
    const newPrice = parseFloat(newProductRows[0]!.priceInclVat);
    const priceDiff = Math.round((newPrice - currentPrice) * 100) / 100;

    return this.db.transaction(async (tx) => {
      // Update the meal record
      await tx
        .update(subscriptionDailyMeals)
        .set({
          productId: newProductId,
          priceInclVat: String(newPrice),
          isSwapped: true,
          swappedFromId: mealRows[0]!.productId,
          swapPriceDiff: String(priceDiff),
        })
        .where(eq(subscriptionDailyMeals.id, mealRows[0]!.id));

      // Adjust wallet if price difference (R12.AC6 checked inside transact)
      let newBalance: string | undefined;
      if (priceDiff !== 0) {
        const result = await this.walletService.transact(tx, {
          subscriptionId,
          type: 'swap_adjustment',
          amount: -priceDiff, // positive priceDiff = more expensive = debit; negative = credit
          description: `Swap day ${dayNumber} slot ${mealSlot}: price diff ${priceDiff > 0 ? '+' : ''}${priceDiff}`,
          mealId: mealRows[0]!.id,
        });
        newBalance = result.newBalance;
      }

      return {
        mealId: mealRows[0]!.id,
        dayNumber,
        mealSlot,
        previousProductId: mealRows[0]!.productId,
        newProductId,
        newProductName: newProductRows[0]!.nameEn,
        priceDifference: priceDiff,
        walletBalance: newBalance,
      };
    });
  }
}
