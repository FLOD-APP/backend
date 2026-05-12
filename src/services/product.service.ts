import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and, isNull, sql } from 'drizzle-orm';
import type * as schemaTypes from '../db/schema.js';
import { products, productCategories, productPrices } from '../db/schema.js';
import { AppError } from '../utils/errors.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

export class ProductService {
  constructor(private db: Db) {}

  /** R7.AC1: List all product categories */
  async listCategories() {
    return this.db
      .select({
        id: productCategories.id,
        nameEn: productCategories.nameEn,
        nameAr: productCategories.nameAr,
        sortOrder: productCategories.sortOrder,
        inSubscription: productCategories.inSubscription,
      })
      .from(productCategories)
      .orderBy(productCategories.sortOrder);
  }

  /** R7.AC2-AC5: List products with pricing for a specific tier */
  async listProducts(filters: { tier: string; categoryId?: string; inSubscription?: boolean }) {
    const now = sql`CURRENT_DATE`;

    // Build the query with joins
    const conditions: ReturnType<typeof eq>[] = [
      eq(products.isActive, true),
      eq(productPrices.tier, filters.tier as 'base' | 'subscription' | 'express_base' | 'express_subscription' | 'app'),
      sql`${productPrices.effectiveFrom} <= ${now}`,
      sql`(${productPrices.effectiveTo} IS NULL OR ${productPrices.effectiveTo} > ${now})`,
    ];

    // Branch-level prices are NULL for global prices
    conditions.push(isNull(productPrices.branchId));

    if (filters.categoryId) {
      conditions.push(eq(products.categoryId, filters.categoryId));
    }

    if (filters.inSubscription) {
      conditions.push(eq(productCategories.inSubscription, true));
    }

    return this.db
      .select({
        id: products.id,
        categoryId: products.categoryId,
        sku: products.sku,
        nameEn: products.nameEn,
        nameAr: products.nameAr,
        calories: products.calories,
        proteinG: products.proteinG,
        carbsG: products.carbsG,
        fatG: products.fatG,
        allergens: products.allergens,
        proteinType: products.proteinType,
        isFree: products.isFree,
        priceInclVat: productPrices.priceInclVat,
      })
      .from(products)
      .innerJoin(productPrices, eq(products.id, productPrices.productId))
      .innerJoin(productCategories, eq(products.categoryId, productCategories.id))
      .where(and(...conditions));
  }

  /** R7.AC6: Get product by ID with all pricing tiers */
  async getById(id: string) {
    const productRows = await this.db
      .select({
        id: products.id,
        categoryId: products.categoryId,
        sku: products.sku,
        nameEn: products.nameEn,
        nameAr: products.nameAr,
        descriptionEn: products.descriptionEn,
        descriptionAr: products.descriptionAr,
        calories: products.calories,
        proteinG: products.proteinG,
        carbsG: products.carbsG,
        fatG: products.fatG,
        servingSizeG: products.servingSizeG,
        allergens: products.allergens,
        proteinType: products.proteinType,
        isFree: products.isFree,
        isActive: products.isActive,
      })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (productRows.length === 0) {
      throw new AppError('Product not found', 'PRODUCT_NOT_FOUND', 404);
    }

    const product = productRows[0]!;

    // Get all current prices for this product
    const now = sql`CURRENT_DATE`;
    const prices = await this.db
      .select({
        tier: productPrices.tier,
        priceInclVat: productPrices.priceInclVat,
        currency: productPrices.currency,
      })
      .from(productPrices)
      .where(
        and(
          eq(productPrices.productId, id),
          isNull(productPrices.branchId),
          sql`${productPrices.effectiveFrom} <= ${now}`,
          sql`(${productPrices.effectiveTo} IS NULL OR ${productPrices.effectiveTo} > ${now})`,
        ),
      );

    return { ...product, prices };
  }
}
