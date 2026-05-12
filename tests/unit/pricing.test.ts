import { calculatePricing } from '../../src/utils/vat.js';

/**
 * Unit tests for pricing calculations.
 * These test the pure math without database dependencies.
 * Integration tests in pricing.test.ts cover discount resolution + DB.
 */

describe('Pricing Calculations', () => {
  describe('R9.AC5: discount applied to ex-VAT, then VAT recalculated', () => {
    it('SAR 24 package with 10% first-plan discount', () => {
      const result = calculatePricing(24, 10, 0.15);

      expect(result.priceInclVat).toBe(24);
      expect(result.priceExVat).toBe(20.87);
      expect(result.discountPercent).toBe(10);
      expect(result.discountAmount).toBe(2.09);
      expect(result.subtotalAfterDiscount).toBe(18.78);
      expect(result.vatOnDiscounted).toBe(2.82);
      expect(result.totalInclVat).toBe(21.6);
    });

    it('SAR 24 package with 5% renewal discount', () => {
      const result = calculatePricing(24, 5, 0.15);

      expect(result.priceExVat).toBe(20.87);
      expect(result.discountAmount).toBe(1.04);
      expect(result.subtotalAfterDiscount).toBe(19.83);
      expect(result.vatOnDiscounted).toBe(2.97);
      expect(result.totalInclVat).toBe(22.8);
    });

    it('SAR 24 package with 0% discount (no discount)', () => {
      const result = calculatePricing(24, 0, 0.15);

      expect(result.discountAmount).toBe(0);
      expect(result.subtotalAfterDiscount).toBe(20.87);
      expect(result.vatOnDiscounted).toBe(3.13);
      expect(result.totalInclVat).toBe(24.0);
    });
  });

  describe('R9.AC4: no discount on snack/sandwich packages', () => {
    it('snack package SAR 12 with 0% discount (discount not applicable)', () => {
      // Snacks get 0% discount — the pricing service sets percent=0 for non-main categories
      const result = calculatePricing(12, 0, 0.15);

      expect(result.priceExVat).toBe(10.43);
      expect(result.discountAmount).toBe(0);
      // round-trip: 10.43 * 0.15 = 1.56, 10.43 + 1.56 = 11.99 (penny lost in rounding)
      expect(result.totalInclVat).toBe(11.99);
    });
  });

  describe('R9.AC3: single discount priority', () => {
    it('promo 15% on SAR 100 package', () => {
      const result = calculatePricing(100, 15, 0.15);

      // 100 / 1.15 = 86.96
      // 15% of 86.96 = 13.04
      // subtotal = 86.96 - 13.04 = 73.92
      // vat = 73.92 * 0.15 = 11.09
      // total = 73.92 + 11.09 = 85.01
      expect(result.priceExVat).toBe(86.96);
      expect(result.discountAmount).toBe(13.04);
      expect(result.subtotalAfterDiscount).toBe(73.92);
      expect(result.vatOnDiscounted).toBe(11.09);
      expect(result.totalInclVat).toBe(85.01);
    });
  });

  describe('edge cases', () => {
    it('SAR 0 package price', () => {
      const result = calculatePricing(0, 10, 0.15);

      expect(result.priceExVat).toBe(0);
      expect(result.discountAmount).toBe(0);
      expect(result.totalInclVat).toBe(0);
    });

    it('large package SAR 1440 with 10% discount', () => {
      const result = calculatePricing(1440, 10, 0.15);

      expect(result.priceExVat).toBe(1252.17);
      expect(result.discountAmount).toBe(125.22);
      expect(result.subtotalAfterDiscount).toBe(1126.95);
      expect(result.vatOnDiscounted).toBe(169.04);
      expect(result.totalInclVat).toBe(1295.99);
    });
  });
});
