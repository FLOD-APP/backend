import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import type * as schemaTypes from '../db/schema.js';
import {
  subscriptions,
  packages,
  packageMealDistribution,
  products,
  productPrices,
  branches,
  walletTransactions,
  subscriptionDailyMeals,
  discountRules,
} from '../db/schema.js';
import { AppError } from '../utils/errors.js';
import { PricingService } from './pricing.service.js';
import { validatePause, type PauseValidationInput } from '../utils/pauseRules.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

const PAUSE_LIMITS: Record<number, number> = { 12: 3, 18: 6, 24: 10 };

interface CreateSubscriptionInput {
  userId: string;
  packageId: string;
  branchId: string;
  fulfilmentMode: 'pickup' | 'delivery';
  startDate: string; // YYYY-MM-DD
  paymentId: string;
  promoCode?: string;
}

export class SubscriptionService {
  private pricingService: PricingService;

  constructor(private db: Db) {
    this.pricingService = new PricingService(db);
  }

  /** R10.AC1-AC6: Create a new subscription */
  async create(input: CreateSubscriptionInput) {
    // R10.AC5: Validate branch is active + Stage 0
    const branchRows = await this.db
      .select({
        id: branches.id,
        isActive: branches.isActive,
        isStage0: branches.isStage0,
      })
      .from(branches)
      .where(eq(branches.id, input.branchId))
      .limit(1);

    if (branchRows.length === 0 || !branchRows[0]!.isActive || !branchRows[0]!.isStage0) {
      throw new AppError(
        'Branch must be an active Stage 0 branch',
        'INVALID_BRANCH',
        400
      );
    }

    // R10.AC6: Check no existing active subscription at same branch
    const activeSubs = await this.db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, input.userId),
          eq(subscriptions.branchId, input.branchId),
          eq(subscriptions.status, 'active')
        )
      )
      .limit(1);

    if (activeSubs.length > 0) {
      throw new AppError(
        'User already has an active subscription at this branch',
        'SUBSCRIPTION_CONFLICT',
        409
      );
    }

    // Get package details
    const pkgRows = await this.db
      .select({
        id: packages.id,
        category: packages.category,
        mealsPerDay: packages.mealsPerDay,
        durationDays: packages.durationDays,
        totalMeals: packages.totalMeals,
        priceInclVat: packages.priceInclVat,
      })
      .from(packages)
      .where(and(eq(packages.id, input.packageId), eq(packages.isActive, true)))
      .limit(1);

    if (pkgRows.length === 0) {
      throw new AppError('Package not found', 'PACKAGE_NOT_FOUND', 404);
    }

    const pkg = pkgRows[0]!;

    // Calculate pricing (R10.AC1: wallet_balance = amount_paid)
    const pricing = await this.pricingService.calculateFullPricing(
      input.packageId,
      input.userId,
      input.promoCode
    );

    // Calculate pause_days_limit from duration
    const pauseDaysLimit = PAUSE_LIMITS[pkg.durationDays] ?? 0;

    // Calculate end_date from start_date + duration
    const startDate = new Date(input.startDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + pkg.durationDays - 1);
    const endDateStr = endDate.toISOString().split('T')[0]!;

    // Generate meal schedule data before transaction
    const scheduleData = await this.generateMealSchedule(input.packageId, pkg);

    // All inserts in a transaction
    return this.db.transaction(async (tx) => {
      // R10.AC4: If promo code, increment current_uses
      if (input.promoCode && pricing.discountRuleId) {
        await tx
          .update(discountRules)
          .set({
            currentUses: sql`${discountRules.currentUses} + 1`,
          })
          .where(eq(discountRules.id, pricing.discountRuleId));
      }

      // R10.AC1: Insert subscription
      const subRows = await tx
        .insert(subscriptions)
        .values({
          userId: input.userId,
          packageId: input.packageId,
          branchId: input.branchId,
          fulfilment: input.fulfilmentMode,
          status: 'active',
          startDate: input.startDate,
          endDate: endDateStr,
          currentDay: 1,
          totalDays: pkg.durationDays,
          pauseDaysUsed: 0,
          pauseDaysLimit,
          discountId: pricing.discountRuleId,
          discountPercent: String(pricing.discountPercent),
          amountPaid: String(pricing.totalInclVat),
          walletBalance: String(pricing.totalInclVat),
          paymentId: input.paymentId,
        })
        .returning();

      const sub = subRows[0]!;

      // R10.AC2: Insert daily meal schedule
      if (scheduleData.length > 0) {
        await tx.insert(subscriptionDailyMeals).values(
          scheduleData.map((meal) => ({
            subscriptionId: sub.id,
            dayNumber: meal.day,
            mealSlot: meal.slot,
            productId: meal.productId,
            priceInclVat: meal.priceInclVat,
          }))
        );
      }

      // R10.AC3: Initial wallet transaction
      await tx.insert(walletTransactions).values({
        subscriptionId: sub.id,
        type: 'initial_credit',
        amount: String(pricing.totalInclVat),
        balanceAfter: String(pricing.totalInclVat),
        description: 'Initial subscription credit',
      });

      return {
        id: sub.id,
        userId: sub.userId,
        packageId: sub.packageId,
        branchId: sub.branchId,
        fulfilment: sub.fulfilment,
        status: sub.status,
        startDate: sub.startDate,
        endDate: sub.endDate,
        currentDay: sub.currentDay,
        totalDays: sub.totalDays,
        pauseDaysUsed: sub.pauseDaysUsed,
        pauseDaysLimit: sub.pauseDaysLimit,
        discountPercent: sub.discountPercent,
        amountPaid: sub.amountPaid,
        walletBalance: sub.walletBalance,
        paymentId: sub.paymentId,
        pricing,
        mealsGenerated: scheduleData.length,
      };
    });
  }

  /** R11.AC1: Get active subscription for user */
  async getActive(userId: string) {
    const rows = await this.db
      .select({
        id: subscriptions.id,
        userId: subscriptions.userId,
        packageId: subscriptions.packageId,
        branchId: subscriptions.branchId,
        fulfilment: subscriptions.fulfilment,
        status: subscriptions.status,
        startDate: subscriptions.startDate,
        endDate: subscriptions.endDate,
        currentDay: subscriptions.currentDay,
        totalDays: subscriptions.totalDays,
        pauseDaysUsed: subscriptions.pauseDaysUsed,
        pauseDaysLimit: subscriptions.pauseDaysLimit,
        discountPercent: subscriptions.discountPercent,
        amountPaid: subscriptions.amountPaid,
        walletBalance: subscriptions.walletBalance,
        packageNameEn: packages.nameEn,
        packageNameAr: packages.nameAr,
        packageCategory: packages.category,
        mealsPerDay: packages.mealsPerDay,
        branchNameEn: branches.nameEn,
        branchNameAr: branches.nameAr,
      })
      .from(subscriptions)
      .innerJoin(packages, eq(subscriptions.packageId, packages.id))
      .innerJoin(branches, eq(subscriptions.branchId, branches.id))
      .where(
        and(
          eq(subscriptions.userId, userId),
          inArray(subscriptions.status, ['active', 'paused'])
        )
      )
      .limit(1);

    if (rows.length === 0) {
      throw new AppError('No active subscription found', 'SUBSCRIPTION_NOT_FOUND', 404);
    }

    const sub = rows[0]!;
    const daysRemaining = sub.totalDays - sub.currentDay + 1;

    return {
      ...sub,
      daysRemaining,
    };
  }

  /** R11.AC2 + R11.AC3 + R11.AC5: Pause subscription */
  async pause(subscriptionId: string, userId: string, pauseStart: string, pauseEnd: string) {
    // Get subscription
    const subRows = await this.db
      .select({
        id: subscriptions.id,
        userId: subscriptions.userId,
        status: subscriptions.status,
        endDate: subscriptions.endDate,
        totalDays: subscriptions.totalDays,
        pauseDaysUsed: subscriptions.pauseDaysUsed,
        pauseDaysLimit: subscriptions.pauseDaysLimit,
      })
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId))
      .limit(1);

    if (subRows.length === 0) {
      throw new AppError('Subscription not found', 'SUBSCRIPTION_NOT_FOUND', 404);
    }

    const sub = subRows[0]!;

    if (sub.userId !== userId) {
      throw new AppError('Not authorized', 'UNAUTHORIZED', 403);
    }

    // Validate pause rules
    const input: PauseValidationInput = {
      subscriptionStatus: sub.status,
      durationDays: sub.totalDays,
      pauseDaysUsed: sub.pauseDaysUsed,
      pauseDaysLimit: sub.pauseDaysLimit,
      pauseStart: new Date(pauseStart),
      pauseEnd: new Date(pauseEnd),
    };

    const validation = validatePause(input);

    if (!validation.valid) {
      throw new AppError(
        validation.error!,
        validation.errorCode!,
        400
      );
    }

    // R11.AC5: Extend end_date by calendar days (including Fridays)
    const currentEndDate = new Date(sub.endDate);
    currentEndDate.setDate(currentEndDate.getDate() + validation.extensionDays!);
    const newEndDateStr = currentEndDate.toISOString().split('T')[0]!;

    // Update subscription
    const updatedRows = await this.db
      .update(subscriptions)
      .set({
        status: 'paused',
        pauseDaysUsed: sub.pauseDaysUsed + validation.businessDays!,
        endDate: newEndDateStr,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscriptionId))
      .returning({
        id: subscriptions.id,
        status: subscriptions.status,
        pauseDaysUsed: subscriptions.pauseDaysUsed,
        pauseDaysLimit: subscriptions.pauseDaysLimit,
        endDate: subscriptions.endDate,
      });

    return {
      ...updatedRows[0]!,
      pauseStart,
      pauseEnd,
      businessDaysPaused: validation.businessDays!,
      extensionDays: validation.extensionDays!,
    };
  }

  /** R11.AC4: Resume subscription */
  async resume(subscriptionId: string, userId: string) {
    const subRows = await this.db
      .select({
        id: subscriptions.id,
        userId: subscriptions.userId,
        status: subscriptions.status,
      })
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId))
      .limit(1);

    if (subRows.length === 0) {
      throw new AppError('Subscription not found', 'SUBSCRIPTION_NOT_FOUND', 404);
    }

    const sub = subRows[0]!;

    if (sub.userId !== userId) {
      throw new AppError('Not authorized', 'UNAUTHORIZED', 403);
    }

    if (sub.status !== 'paused') {
      throw new AppError('Subscription is not paused', 'NOT_PAUSED', 400);
    }

    const updatedRows = await this.db
      .update(subscriptions)
      .set({
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscriptionId))
      .returning({
        id: subscriptions.id,
        status: subscriptions.status,
      });

    return updatedRows[0]!;
  }

  /** R11.AC6: Get daily meal schedule for a subscription */
  async getSchedule(subscriptionId: string, userId: string) {
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

    const meals = await this.db
      .select({
        dayNumber: subscriptionDailyMeals.dayNumber,
        mealSlot: subscriptionDailyMeals.mealSlot,
        productId: subscriptionDailyMeals.productId,
        priceInclVat: subscriptionDailyMeals.priceInclVat,
        isCollected: subscriptionDailyMeals.isCollected,
        collectedAt: subscriptionDailyMeals.collectedAt,
        isSwapped: subscriptionDailyMeals.isSwapped,
        productNameEn: products.nameEn,
        productNameAr: products.nameAr,
      })
      .from(subscriptionDailyMeals)
      .innerJoin(products, eq(subscriptionDailyMeals.productId, products.id))
      .where(eq(subscriptionDailyMeals.subscriptionId, subscriptionId))
      .orderBy(subscriptionDailyMeals.dayNumber, subscriptionDailyMeals.mealSlot);

    return { subscriptionId, schedule: meals };
  }

  /** R11.AC7: Get subscription history */
  async getHistory(userId: string) {
    return this.db
      .select({
        id: subscriptions.id,
        packageId: subscriptions.packageId,
        branchId: subscriptions.branchId,
        status: subscriptions.status,
        startDate: subscriptions.startDate,
        endDate: subscriptions.endDate,
        totalDays: subscriptions.totalDays,
        amountPaid: subscriptions.amountPaid,
        discountPercent: subscriptions.discountPercent,
        createdAt: subscriptions.createdAt,
        packageNameEn: packages.nameEn,
        branchNameEn: branches.nameEn,
      })
      .from(subscriptions)
      .innerJoin(packages, eq(subscriptions.packageId, packages.id))
      .innerJoin(branches, eq(subscriptions.branchId, branches.id))
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.createdAt));
  }

  /** Generate meal schedule from package distribution + product catalog */
  private async generateMealSchedule(
    packageId: string,
    pkg: { mealsPerDay: number; durationDays: number }
  ) {
    // Get meal distribution
    const distribution = await this.db
      .select({
        proteinType: packageMealDistribution.proteinType,
        mealCount: packageMealDistribution.mealCount,
      })
      .from(packageMealDistribution)
      .where(eq(packageMealDistribution.packageId, packageId));

    if (distribution.length === 0) {
      return [];
    }

    // Build round-robin queue
    const queue: string[] = [];
    const dist = [...distribution].sort((a, b) => b.mealCount - a.mealCount);
    const remaining = new Map(dist.map((d) => [d.proteinType, d.mealCount]));
    let totalRemaining = dist.reduce((sum, d) => sum + d.mealCount, 0);

    while (totalRemaining > 0) {
      for (const d of dist) {
        const left = remaining.get(d.proteinType) ?? 0;
        if (left > 0) {
          queue.push(d.proteinType);
          remaining.set(d.proteinType, left - 1);
          totalRemaining--;
        }
      }
    }

    // Get one product per protein type with subscription pricing
    const now = sql`CURRENT_DATE`;
    const proteinTypes = [...new Set(queue)];
    const productMap = new Map<string, { id: string; priceInclVat: string }>();

    for (const pt of proteinTypes) {
      const rows = await this.db
        .select({
          id: products.id,
          priceInclVat: productPrices.priceInclVat,
        })
        .from(products)
        .innerJoin(productPrices, eq(products.id, productPrices.productId))
        .where(
          and(
            eq(products.isActive, true),
            eq(products.proteinType, pt),
            eq(productPrices.tier, 'subscription'),
            sql`${productPrices.branchId} IS NULL`,
            sql`${productPrices.effectiveFrom} <= ${now}`,
            sql`(${productPrices.effectiveTo} IS NULL OR ${productPrices.effectiveTo} > ${now})`
          )
        )
        .limit(1);

      if (rows.length > 0) {
        productMap.set(pt, rows[0]!);
      }
    }

    // Build schedule
    return queue
      .map((proteinType, index) => {
        const product = productMap.get(proteinType);
        if (!product) return null;

        return {
          day: Math.floor(index / pkg.mealsPerDay) + 1,
          slot: (index % pkg.mealsPerDay) + 1,
          proteinType,
          productId: product.id,
          priceInclVat: product.priceInclVat,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);
  }
}
