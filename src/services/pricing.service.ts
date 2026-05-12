import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and, sql, inArray } from 'drizzle-orm';
import type * as schemaTypes from '../db/schema.js';
import {
  packages,
  subscriptions,
  discountRules,
  systemSettings,
} from '../db/schema.js';
import { AppError } from '../utils/errors.js';
import { calculatePricing } from '../utils/vat.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

export interface DiscountResolution {
  type: 'promo_code' | 'first_plan' | 'renewal' | 'none';
  percent: number;
  discountRuleId: string | null;
}

export interface FullPricingBreakdown {
  packageId: string;
  basePriceInclVat: number;
  priceExVat: number;
  applicableDiscountType: string;
  discountPercent: number;
  discountAmount: number;
  subtotalAfterDiscount: number;
  vatOnDiscounted: number;
  totalInclVat: number;
  discountRuleId: string | null;
}

export class PricingService {
  constructor(private db: Db) {}

  /** R9.AC3 + R9.AC6: Resolve which discount applies — promo > first_plan > renewal */
  async resolveDiscount(userId: string, promoCode?: string): Promise<DiscountResolution> {
    // 1. If promo code provided, validate it
    if (promoCode) {
      return this.validateAndResolvePromo(promoCode);
    }

    // 2. Check user's subscription history
    const pastSubs = await this.db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          inArray(subscriptions.status, ['active', 'expired', 'cancelled'])
        )
      );

    // 3. Read discount rates from system_settings (R9.AC6)
    if (pastSubs.length === 0) {
      // First-plan discount
      const percent = await this.getSettingNumber('first_plan_discount_percent');
      return { type: 'first_plan', percent, discountRuleId: null };
    }

    // Renewal discount
    const percent = await this.getSettingNumber('renewal_discount_percent');
    return { type: 'renewal', percent, discountRuleId: null };
  }

  /** R9.AC7 + R9.AC8: Validate a promo code */
  async validatePromo(code: string): Promise<{ discountPercent: number; type: string; ruleId: string }> {
    const resolution = await this.validateAndResolvePromo(code);
    return {
      discountPercent: resolution.percent,
      type: resolution.type,
      ruleId: resolution.discountRuleId!,
    };
  }

  /** R9.AC2: Calculate full pricing for a package + user + optional promo */
  async calculateFullPricing(
    packageId: string,
    userId: string,
    promoCode?: string
  ): Promise<FullPricingBreakdown> {
    // Get package price
    const pkgRows = await this.db
      .select({
        id: packages.id,
        priceInclVat: packages.priceInclVat,
        category: packages.category,
      })
      .from(packages)
      .where(and(eq(packages.id, packageId), eq(packages.isActive, true)))
      .limit(1);

    if (pkgRows.length === 0) {
      throw new AppError('Package not found', 'PACKAGE_NOT_FOUND', 404);
    }

    const pkg = pkgRows[0]!;
    const basePriceInclVat = parseFloat(pkg.priceInclVat);

    // R9.AC4: Only apply discounts to main meals (chicken, beef, seafood — mixed/chicken categories)
    const discountableCategories = ['mixed', 'chicken'];
    const isDiscountable = discountableCategories.includes(pkg.category);

    // Get VAT rate from settings (R9.AC6)
    const vatRate = await this.getSettingNumber('vat_rate');

    let discount: DiscountResolution;
    if (isDiscountable) {
      discount = await this.resolveDiscount(userId, promoCode);
    } else {
      // R9.AC4: No discount for snacks, sandwiches, customer_choice
      discount = { type: 'none', percent: 0, discountRuleId: null };
    }

    const pricing = calculatePricing(basePriceInclVat, discount.percent, vatRate);

    return {
      packageId: pkg.id,
      basePriceInclVat: pricing.priceInclVat,
      priceExVat: pricing.priceExVat,
      applicableDiscountType: discount.type,
      discountPercent: pricing.discountPercent,
      discountAmount: pricing.discountAmount,
      subtotalAfterDiscount: pricing.subtotalAfterDiscount,
      vatOnDiscounted: pricing.vatOnDiscounted,
      totalInclVat: pricing.totalInclVat,
      discountRuleId: discount.discountRuleId,
    };
  }

  // ─── Private helpers ───────────────────────────────────

  private async validateAndResolvePromo(code: string): Promise<DiscountResolution> {
    const rows = await this.db
      .select({
        id: discountRules.id,
        type: discountRules.type,
        discountPercent: discountRules.discountPercent,
        maxUses: discountRules.maxUses,
        currentUses: discountRules.currentUses,
        validFrom: discountRules.validFrom,
        validTo: discountRules.validTo,
        isActive: discountRules.isActive,
      })
      .from(discountRules)
      .where(eq(discountRules.code, code))
      .limit(1);

    if (rows.length === 0) {
      throw new AppError('Promo code not found', 'PROMO_NOT_FOUND', 400);
    }

    const rule = rows[0]!;

    if (!rule.isActive) {
      throw new AppError('Promo code is inactive', 'PROMO_INACTIVE', 400);
    }

    const now = new Date();
    if (rule.validFrom && now < rule.validFrom) {
      throw new AppError('Promo code is not yet valid', 'PROMO_EXPIRED', 400);
    }
    if (rule.validTo && now > rule.validTo) {
      throw new AppError('Promo code has expired', 'PROMO_EXPIRED', 400);
    }

    if (rule.maxUses !== null && rule.currentUses >= rule.maxUses) {
      throw new AppError('Promo code usage limit reached', 'PROMO_LIMIT_REACHED', 400);
    }

    return {
      type: 'promo_code',
      percent: parseFloat(rule.discountPercent),
      discountRuleId: rule.id,
    };
  }

  private async getSettingNumber(key: string): Promise<number> {
    const rows = await this.db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);

    if (rows.length === 0) {
      throw new AppError(`Setting '${key}' not found`, 'SETTING_NOT_FOUND', 500);
    }

    return parseFloat(rows[0]!.value);
  }
}
