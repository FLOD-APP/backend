/**
 * VAT calculation utilities for FLOD.
 *
 * All prices in the system are VAT-INCLUSIVE (15% Saudi Arabia standard).
 * Corrected by Abu Talin on 12 May 2026.
 *
 * Formula:
 *   price_ex_vat = price_incl_vat / 1.15
 *   vat_amount = price_incl_vat - price_ex_vat
 *
 * Discount flow:
 *   1. Extract VAT from inclusive price
 *   2. Apply discount to ex-VAT amount
 *   3. Recalculate VAT on discounted subtotal
 */

export interface PricingBreakdown {
  priceInclVat: number;
  priceExVat: number;
  discountPercent: number;
  discountAmount: number;
  subtotalAfterDiscount: number;
  vatOnDiscounted: number;
  totalInclVat: number;
}

export function extractVat(
  priceInclVat: number,
  vatRate: number = 0.15
): { priceExVat: number; vatAmount: number } {
  const priceExVat = round2(priceInclVat / (1 + vatRate));
  const vatAmount = round2(priceInclVat - priceExVat);
  return { priceExVat, vatAmount };
}

export function calculatePricing(
  priceInclVat: number,
  discountPercent: number,
  vatRate: number = 0.15
): PricingBreakdown {
  const priceExVat = round2(priceInclVat / (1 + vatRate));
  const discountAmount = round2(priceExVat * (discountPercent / 100));
  const subtotalAfterDiscount = round2(priceExVat - discountAmount);
  const vatOnDiscounted = round2(subtotalAfterDiscount * vatRate);
  const totalInclVat = round2(subtotalAfterDiscount + vatOnDiscounted);

  return {
    priceInclVat,
    priceExVat,
    discountPercent,
    discountAmount,
    subtotalAfterDiscount,
    vatOnDiscounted,
    totalInclVat,
  };
}

/** Round to 2 decimal places (SAR precision) */
export function roundSar(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
