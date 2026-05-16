/// <reference types="jest" />

import { extractVat, calculatePricing, roundSar } from '../../src/utils/vat.js';

// All examples taken from HANDOVER_Pricing_Database_Design.md

describe('VAT Utilities', () => {
  describe('roundSar', () => {
    it('should round to 2 decimal places', () => {
      expect(roundSar(20.8695652173913)).toBe(20.87);
      expect(roundSar(3.1304347826087)).toBe(3.13);
      expect(roundSar(0)).toBe(0);
      expect(roundSar(100)).toBe(100);
    });

    it('should handle banker rounding edge cases', () => {
      expect(roundSar(2.005)).toBe(2.01); // standard rounding
      expect(roundSar(1.995)).toBe(2.0);
    });
  });

  describe('extractVat', () => {
    it('R9.AC1: should extract VAT from SAR 24 (handover example)', () => {
      const result = extractVat(24, 0.15);

      expect(result.priceExVat).toBe(20.87);
      expect(result.vatAmount).toBe(3.13);
    });

    it('should extract VAT from SAR 0', () => {
      const result = extractVat(0, 0.15);

      expect(result.priceExVat).toBe(0);
      expect(result.vatAmount).toBe(0);
    });

    it('should handle SAR 12 delivery fee', () => {
      const result = extractVat(12, 0.15);

      expect(result.priceExVat).toBe(10.43);
      expect(result.vatAmount).toBe(1.57);
    });

    it('should handle SAR 1 (small amount)', () => {
      const result = extractVat(1, 0.15);

      expect(result.priceExVat).toBe(0.87);
      expect(result.vatAmount).toBe(0.13);
    });
  });

  describe('calculatePricing', () => {
    it('R9.AC5: SAR 24 with 10% discount (handover example)', () => {
      const result = calculatePricing(24, 10, 0.15);

      expect(result.priceInclVat).toBe(24);
      expect(result.priceExVat).toBe(20.87);
      expect(result.discountPercent).toBe(10);
      expect(result.discountAmount).toBe(2.09);
      expect(result.subtotalAfterDiscount).toBe(18.78);
      expect(result.vatOnDiscounted).toBe(2.82);
      expect(result.totalInclVat).toBe(21.6);
    });

    it('R9.AC5: SAR 24 with 5% renewal discount', () => {
      const result = calculatePricing(24, 5, 0.15);

      // 24 / 1.15 = 20.87
      // discount = 20.87 * 0.05 = 1.04
      // subtotal = 20.87 - 1.04 = 19.83
      // vat = 19.83 * 0.15 = 2.97
      // total = 19.83 + 2.97 = 22.80
      expect(result.priceExVat).toBe(20.87);
      expect(result.discountAmount).toBe(1.04);
      expect(result.subtotalAfterDiscount).toBe(19.83);
      expect(result.vatOnDiscounted).toBe(2.97);
      expect(result.totalInclVat).toBe(22.8);
    });

    it('R9.AC5: SAR 24 with 0% discount (no discount)', () => {
      const result = calculatePricing(24, 0, 0.15);

      expect(result.priceExVat).toBe(20.87);
      expect(result.discountAmount).toBe(0);
      expect(result.subtotalAfterDiscount).toBe(20.87);
      expect(result.vatOnDiscounted).toBe(3.13);
      expect(result.totalInclVat).toBe(24.0);
    });

    it('R9.AC5: SAR 0 price', () => {
      const result = calculatePricing(0, 10, 0.15);

      expect(result.priceExVat).toBe(0);
      expect(result.discountAmount).toBe(0);
      expect(result.subtotalAfterDiscount).toBe(0);
      expect(result.vatOnDiscounted).toBe(0);
      expect(result.totalInclVat).toBe(0);
    });

    it('R9.AC5: larger package price — SAR 1440 mixed 3-meal 24-day', () => {
      // 1440 / 1.15 = 1252.17
      // 10% discount = 125.22
      // subtotal = 1252.17 - 125.22 = 1126.95 (rounded)
      // vat = 1126.95 * 0.15 = 169.04
      // total = 1126.95 + 169.04 = 1295.99
      const result = calculatePricing(1440, 10, 0.15);

      expect(result.priceExVat).toBe(1252.17);
      expect(result.discountAmount).toBe(125.22);
      // 1252.17 - 125.22 = 1126.95
      expect(result.subtotalAfterDiscount).toBe(1126.95);
      // 1126.95 * 0.15 = 169.04
      expect(result.vatOnDiscounted).toBe(169.04);
      // 1126.95 + 169.04 = 1295.99
      expect(result.totalInclVat).toBe(1295.99);
    });

    it('R9.AC1: result priceInclVat should match input', () => {
      const result = calculatePricing(24, 10, 0.15);
      expect(result.priceInclVat).toBe(24);
    });

    it('R9.AC5: discount is applied to ex-VAT amount, not inclusive', () => {
      // This verifies the formula: discount on ex-VAT, then re-add VAT
      const result = calculatePricing(100, 10, 0.15);

      // 100 / 1.15 = 86.96
      // 10% of 86.96 = 8.70
      // subtotal = 86.96 - 8.70 = 78.26
      // vat = 78.26 * 0.15 = 11.74
      // total = 78.26 + 11.74 = 90.00
      expect(result.priceExVat).toBe(86.96);
      expect(result.discountAmount).toBe(8.7);
      expect(result.subtotalAfterDiscount).toBe(78.26);
      expect(result.vatOnDiscounted).toBe(11.74);
      expect(result.totalInclVat).toBe(90.0);
    });
  });
});
