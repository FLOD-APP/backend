import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and, isNull, sql } from 'drizzle-orm';
import type * as schemaTypes from '../db/schema.js';
import { rotationSchedules, rotationSwapOptions, products, productPrices } from '../db/schema.js';
import { AppError } from '../utils/errors.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

export class RotationService {
  constructor(private db: Db) {}

  /** R13.AC1: List rotation entries by type (snack or sandwich) */
  async listByType(type: string) {
    if (type !== 'snack' && type !== 'sandwich') {
      throw new AppError(
        'Rotation type must be "snack" or "sandwich"',
        'VALIDATION_ERROR',
        400
      );
    }

    return this.db
      .select({
        id: rotationSchedules.id,
        type: rotationSchedules.type,
        dayNumber: rotationSchedules.dayNumber,
        productId: rotationSchedules.productId,
        priceInclVat: rotationSchedules.priceInclVat,
        nameEn: products.nameEn,
        nameAr: products.nameAr,
      })
      .from(rotationSchedules)
      .innerJoin(products, eq(rotationSchedules.productId, products.id))
      .where(eq(rotationSchedules.type, type))
      .orderBy(rotationSchedules.dayNumber);
  }

  /** R13.AC2: Get swap options for a specific rotation day */
  async getSwapOptions(type: string, dayNumber: number) {
    if (type !== 'snack' && type !== 'sandwich') {
      throw new AppError(
        'Rotation type must be "snack" or "sandwich"',
        'VALIDATION_ERROR',
        400
      );
    }

    // Find the schedule entry
    const scheduleRows = await this.db
      .select({ id: rotationSchedules.id })
      .from(rotationSchedules)
      .where(
        and(
          eq(rotationSchedules.type, type as 'snack' | 'sandwich'),
          eq(rotationSchedules.dayNumber, dayNumber)
        )
      )
      .limit(1);

    if (scheduleRows.length === 0) {
      throw new AppError('Rotation day not found', 'ROTATION_NOT_FOUND', 404);
    }

    const scheduleId = scheduleRows[0]!.id;
    const now = sql`CURRENT_DATE`;

    return this.db
      .select({
        id: rotationSwapOptions.id,
        swapProductId: rotationSwapOptions.swapProductId,
        nameEn: products.nameEn,
        nameAr: products.nameAr,
        priceInclVat: productPrices.priceInclVat,
      })
      .from(rotationSwapOptions)
      .innerJoin(products, eq(rotationSwapOptions.swapProductId, products.id))
      .leftJoin(
        productPrices,
        and(
          eq(productPrices.productId, products.id),
          eq(productPrices.tier, 'subscription'),
          isNull(productPrices.branchId),
          sql`${productPrices.effectiveFrom} <= ${now}`,
          sql`(${productPrices.effectiveTo} IS NULL OR ${productPrices.effectiveTo} > ${now})`
        )
      )
      .where(eq(rotationSwapOptions.scheduleId, scheduleId));
  }
}
