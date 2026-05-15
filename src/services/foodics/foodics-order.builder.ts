/**
 * Foodics order builder — pure function.
 *
 * Transforms FLOD meal collection data into a Foodics API v5 order payload.
 * Fully unit-testable without API access.
 *
 * Key rules:
 * - FLOD prices are VAT-inclusive; Foodics expects the same when tax_inclusive=true
 * - House Account (payment method type 7) is used for all subscription meals
 * - Each meal collection = 1 Foodics order
 * - Modifiers (carb, sauce, vegetables) are included as options
 * - Discounts are applied per-line (not lump sum)
 * - Reference field = FLOD meal ID for traceability
 */

import { extractVat } from '../../utils/vat.js';
import type {
  FlodMealCollectionInput,
  FoodicsOrderPayload,
  FoodicsCreateOrderRequest,
  FoodicsOrderProduct,
  FoodicsOrderProductOption,
} from './foodics.types.js';

/**
 * Build a Foodics order payload from FLOD meal collection data.
 *
 * @param input - FLOD meal data with Foodics ID mappings
 * @returns Foodics order request body + metadata for logging
 *
 * @example
 * ```ts
 * const payload = buildFoodicsOrder({
 *   mealId: 'uuid-123',
 *   foodicsBranchId: 'branch-uuid',
 *   foodicsProductId: 'product-uuid',
 *   foodicsPaymentMethodId: 'pm-uuid',
 *   unitPriceInclVat: 24,
 *   quantity: 1,
 * });
 * // payload.request is ready for POST /orders
 * ```
 */
export function buildFoodicsOrder(input: FlodMealCollectionInput): FoodicsOrderPayload {
  const { priceExVat, vatAmount } = extractVat(input.unitPriceInclVat);

  const lineTotal = Math.round(input.unitPriceInclVat * input.quantity * 100) / 100;
  const lineTotalExVat = Math.round(priceExVat * input.quantity * 100) / 100;
  const lineTotalVat = Math.round(vatAmount * input.quantity * 100) / 100;

  // Build product line
  const product: FoodicsOrderProduct = {
    product_id: input.foodicsProductId,
    quantity: input.quantity,
    unit_price: input.unitPriceInclVat.toFixed(5),
  };

  // Add modifier options if present (carb, sauce, vegetables — all SAR 0)
  if (input.modifierOptionIds && input.modifierOptionIds.length > 0) {
    product.options = input.modifierOptionIds.map(
      (id): FoodicsOrderProductOption => ({
        modifier_option_id: id,
        quantity: 1,
      }),
    );
  }

  // Add notes if present
  if (input.notes) {
    product.notes = input.notes;
  }

  // Add per-line discount if present
  if (input.discountAmount && input.discountAmount > 0) {
    product.discount_amount = input.discountAmount.toFixed(5);
  }

  // Calculate payment amount (after discount)
  const discountTotal = input.discountAmount ? Math.round(input.discountAmount * input.quantity * 100) / 100 : 0;
  const paymentAmount = Math.round((lineTotal - discountTotal) * 100) / 100;

  // Build order request
  const request: FoodicsCreateOrderRequest = {
    branch_id: input.foodicsBranchId,
    type: 3, // pickup (FLOD customers pick up at branch)
    products: [product],
    payments: [
      {
        payment_method_id: input.foodicsPaymentMethodId,
        amount: paymentAmount.toFixed(5),
      },
    ],
    reference: `FLOD-${input.mealId}`,
  };

  // Add customer if mapped
  if (input.foodicsCustomerId) {
    request.customer_id = input.foodicsCustomerId;
  }

  return {
    request,
    meta: {
      flodMealId: input.mealId,
      totalInclVat: lineTotal,
      vatAmount: lineTotalVat,
      subtotalExVat: lineTotalExVat,
    },
  };
}

/**
 * Validate that all required Foodics mappings exist before attempting to sync.
 * Returns a list of missing mappings.
 */
export function validateFoodicsMappings(input: {
  foodicsBranchId: string | null;
  foodicsProductId: string | null;
  foodicsPaymentMethodId: string | null;
}): string[] {
  const missing: string[] = [];
  if (!input.foodicsBranchId) missing.push('foodics_branch_id');
  if (!input.foodicsProductId) missing.push('foodics_product_id');
  if (!input.foodicsPaymentMethodId) missing.push('foodics_payment_method_id');
  return missing;
}
