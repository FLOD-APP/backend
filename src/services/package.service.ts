import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and, isNull, sql } from 'drizzle-orm';
import type * as schemaTypes from '../db/schema.js';
import { packages, packageMealDistribution, products, productPrices } from '../db/schema.js';
import { AppError } from '../utils/errors.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

export class PackageService {
  constructor(private db: Db) {}

  /** R8.AC1 + R8.AC2: List active packages, optionally filtered by category */
  async list(filters: { category?: string } = {}) {
    const conditions: ReturnType<typeof eq>[] = [eq(packages.isActive, true)];

    if (filters.category) {
      conditions.push(
        eq(packages.category, filters.category as 'mixed' | 'chicken' | 'snack' | 'sandwich' | 'customer_choice'),
      );
    }

    return this.db
      .select({
        id: packages.id,
        category: packages.category,
        nameEn: packages.nameEn,
        nameAr: packages.nameAr,
        mealsPerDay: packages.mealsPerDay,
        durationDays: packages.durationDays,
        totalMeals: packages.totalMeals,
        priceInclVat: packages.priceInclVat,
        sortOrder: packages.sortOrder,
      })
      .from(packages)
      .where(and(...conditions))
      .orderBy(packages.sortOrder);
  }

  /** R8.AC3: Get package by ID with meal distribution */
  async getById(id: string) {
    const pkgRows = await this.db
      .select({
        id: packages.id,
        category: packages.category,
        nameEn: packages.nameEn,
        nameAr: packages.nameAr,
        mealsPerDay: packages.mealsPerDay,
        durationDays: packages.durationDays,
        totalMeals: packages.totalMeals,
        priceInclVat: packages.priceInclVat,
        sortOrder: packages.sortOrder,
      })
      .from(packages)
      .where(eq(packages.id, id))
      .limit(1);

    if (pkgRows.length === 0) {
      throw new AppError('Package not found', 'PACKAGE_NOT_FOUND', 404);
    }

    const pkg = pkgRows[0]!;

    // Get meal distribution
    const distribution = await this.db
      .select({
        proteinType: packageMealDistribution.proteinType,
        mealCount: packageMealDistribution.mealCount,
      })
      .from(packageMealDistribution)
      .where(eq(packageMealDistribution.packageId, id));

    return { ...pkg, mealDistribution: distribution };
  }

  /** R8.AC4: Generate daily meal schedule from distribution + product catalog */
  async generateSchedule(id: string) {
    // Get package with distribution
    const pkg = await this.getById(id);

    if (pkg.mealDistribution.length === 0) {
      return { packageId: id, schedule: [] };
    }

    // Build round-robin queue from protein type distribution
    // e.g., { chicken: 5, beef: 3, salmon: 1, almond_fish: 2, shrimp: 1 }
    // → [chicken, beef, salmon, almond_fish, shrimp, chicken, beef, almond_fish, chicken, beef, chicken, chicken]
    const queue: string[] = [];
    const dist = [...pkg.mealDistribution].sort((a, b) => b.mealCount - a.mealCount);

    // Round-robin: take one from each type per round until all allocated
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

    // Get one product per protein type (first active product, subscription-priced)
    const now = sql`CURRENT_DATE`;
    const proteinTypes = [...new Set(queue)];
    const productMap = new Map<string, { id: string; nameEn: string; nameAr: string; priceInclVat: string }>();

    for (const pt of proteinTypes) {
      const rows = await this.db
        .select({
          id: products.id,
          nameEn: products.nameEn,
          nameAr: products.nameAr,
          priceInclVat: productPrices.priceInclVat,
        })
        .from(products)
        .innerJoin(productPrices, eq(products.id, productPrices.productId))
        .where(
          and(
            eq(products.isActive, true),
            eq(products.proteinType, pt),
            eq(productPrices.tier, 'subscription'),
            isNull(productPrices.branchId),
            sql`${productPrices.effectiveFrom} <= ${now}`,
            sql`(${productPrices.effectiveTo} IS NULL OR ${productPrices.effectiveTo} > ${now})`,
          ),
        )
        .limit(1);

      if (rows.length > 0) {
        productMap.set(pt, rows[0]!);
      }
    }

    // Build the schedule
    const schedule = queue.map((proteinType, index) => {
      const day = Math.floor(index / pkg.mealsPerDay) + 1;
      const slot = (index % pkg.mealsPerDay) + 1;
      const product = productMap.get(proteinType);

      return {
        day,
        slot,
        proteinType,
        productId: product?.id ?? null,
        nameEn: product?.nameEn ?? null,
        nameAr: product?.nameAr ?? null,
        priceInclVat: product?.priceInclVat ?? null,
      };
    });

    return { packageId: id, schedule };
  }
}
