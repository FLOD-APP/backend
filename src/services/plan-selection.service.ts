import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, sql, and, inArray } from 'drizzle-orm';
import type * as schemaTypes from '../db/schema.js';
import { planSelections, packages, products } from '../db/schema.js';
import { AppError } from '../utils/errors.js';
import type { CreatePlanSelectionInput } from '../validators/plan-selection.validators.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

interface AddOns {
  snackIncluded: boolean;
  juice: Record<string, Record<string, number>>;
  soup: Record<string, Record<string, number>>;
}

export class PlanSelectionService {
  constructor(private db: Db) {}

  /**
   * Create or replace the user's plan selection (upsert).
   * R1.AC1, R1.AC5, R1.AC6, R5.AC2
   */
  async upsert(userId: string, input: CreatePlanSelectionInput) {
    // Validate package exists and is active
    await this.validatePackage(input.packageId);

    // Validate add-on product IDs
    const addOns = input.addOns as AddOns;
    await this.validateAddOnProducts(addOns);

    const [row] = await this.db
      .insert(planSelections)
      .values({
        userId,
        packageId: input.packageId,
        duration: input.duration,
        mealsPerDay: input.mealsPerDay,
        branchId: input.branchId ?? null,
        fulfilment: input.fulfilment,
        deliveryAddressId: input.deliveryAddressId ?? null,
        startDate: input.startDate ?? null,
        slot: input.slot,
        addOns: addOns,
      })
      .onConflictDoUpdate({
        target: planSelections.userId,
        set: {
          packageId: input.packageId,
          duration: input.duration,
          mealsPerDay: input.mealsPerDay,
          branchId: input.branchId ?? null,
          fulfilment: input.fulfilment,
          deliveryAddressId: input.deliveryAddressId ?? null,
          startDate: input.startDate ?? null,
          slot: input.slot,
          addOns: addOns,
          updatedAt: sql`now()`,
        },
      })
      .returning();

    return row!;
  }

  /**
   * Get the user's current plan selection.
   * R2.AC1, R2.AC2
   */
  async getByUserId(userId: string) {
    const rows = await this.db.select().from(planSelections).where(eq(planSelections.userId, userId)).limit(1);

    if (rows.length === 0) {
      throw new AppError('No plan selection found', 'PLAN_SELECTION_NOT_FOUND', 404);
    }

    return rows[0]!;
  }

  /**
   * Full replace update of the user's plan selection.
   * R3.AC1, R3.AC2, R3.AC3
   */
  async update(userId: string, input: CreatePlanSelectionInput) {
    // Validate package exists and is active
    await this.validatePackage(input.packageId);

    // Validate add-on product IDs
    const addOns = input.addOns as AddOns;
    await this.validateAddOnProducts(addOns);

    const rows = await this.db
      .update(planSelections)
      .set({
        packageId: input.packageId,
        duration: input.duration,
        mealsPerDay: input.mealsPerDay,
        branchId: input.branchId ?? null,
        fulfilment: input.fulfilment,
        deliveryAddressId: input.deliveryAddressId ?? null,
        startDate: input.startDate ?? null,
        slot: input.slot,
        addOns: addOns,
        updatedAt: new Date(),
      })
      .where(eq(planSelections.userId, userId))
      .returning();

    if (rows.length === 0) {
      throw new AppError('No plan selection found', 'PLAN_SELECTION_NOT_FOUND', 404);
    }

    return rows[0]!;
  }

  /**
   * Delete the user's plan selection.
   * R4.AC1, R4.AC2, R4.AC3 — idempotent, no error if not found.
   */
  async deleteByUserId(userId: string): Promise<void> {
    await this.db.delete(planSelections).where(eq(planSelections.userId, userId));
  }

  /**
   * Validate that a package exists and is active.
   */
  private async validatePackage(packageId: string): Promise<void> {
    const rows = await this.db
      .select({ id: packages.id })
      .from(packages)
      .where(and(eq(packages.id, packageId), eq(packages.isActive, true)))
      .limit(1);

    if (rows.length === 0) {
      throw new AppError('Package not found or inactive', 'PACKAGE_NOT_FOUND', 400);
    }
  }

  /**
   * Validate that all product IDs in juice/soup add-ons exist and are active.
   * R6.AC2, R6.AC3
   */
  private async validateAddOnProducts(addOns: AddOns): Promise<void> {
    const productIds = new Set<string>();

    for (const dayItems of Object.values(addOns.juice)) {
      for (const productId of Object.keys(dayItems)) {
        productIds.add(productId);
      }
    }

    for (const dayItems of Object.values(addOns.soup)) {
      for (const productId of Object.keys(dayItems)) {
        productIds.add(productId);
      }
    }

    if (productIds.size === 0) return;

    const ids = Array.from(productIds);
    const activeProducts = await this.db
      .select({ id: products.id })
      .from(products)
      .where(and(inArray(products.id, ids), eq(products.isActive, true)));

    const foundIds = new Set(activeProducts.map((p) => p.id));
    const missing = ids.filter((id) => !foundIds.has(id));

    if (missing.length > 0) {
      throw new AppError(`Invalid or inactive add-on product IDs: ${missing.join(', ')}`, 'INVALID_ADDON_PRODUCT', 400);
    }
  }
}
