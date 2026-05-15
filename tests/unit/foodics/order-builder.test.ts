import { buildFoodicsOrder, validateFoodicsMappings } from '../../../src/services/foodics/foodics-order.builder.js';
import type { FlodMealCollectionInput } from '../../../src/services/foodics/foodics.types.js';

describe('buildFoodicsOrder', () => {
  const baseInput: FlodMealCollectionInput = {
    mealId: '550e8400-e29b-41d4-a716-446655440000',
    foodicsBranchId: 'branch-uuid-001',
    foodicsProductId: 'product-uuid-001',
    foodicsCustomerId: 'customer-uuid-001',
    foodicsPaymentMethodId: 'pm-uuid-001',
    unitPriceInclVat: 24,
    quantity: 1,
  };

  it('should build correct order for SAR 24 chicken meal', () => {
    const result = buildFoodicsOrder(baseInput);

    expect(result.request.branch_id).toBe('branch-uuid-001');
    expect(result.request.type).toBe(3); // pickup
    expect(result.request.customer_id).toBe('customer-uuid-001');
    expect(result.request.reference).toBe('FLOD-550e8400-e29b-41d4-a716-446655440000');
    expect(result.request.products).toHaveLength(1);
    expect(result.request.products[0]!.product_id).toBe('product-uuid-001');
    expect(result.request.products[0]!.quantity).toBe(1);
    expect(result.request.products[0]!.unit_price).toBe('24.00000');
    expect(result.request.payments).toHaveLength(1);
    expect(result.request.payments[0]!.payment_method_id).toBe('pm-uuid-001');
    expect(result.request.payments[0]!.amount).toBe('24.00000');
  });

  it('should extract correct VAT from SAR 24 (Abu Talin v5 example)', () => {
    const result = buildFoodicsOrder(baseInput);

    // SAR 24 -> SAR 20.87 ex-VAT + SAR 3.13 VAT
    expect(result.meta.totalInclVat).toBe(24);
    expect(result.meta.subtotalExVat).toBe(20.87);
    expect(result.meta.vatAmount).toBe(3.13);
    expect(result.meta.flodMealId).toBe(baseInput.mealId);
  });

  it('should handle salmon at SAR 42', () => {
    const input: FlodMealCollectionInput = {
      ...baseInput,
      unitPriceInclVat: 42,
    };
    const result = buildFoodicsOrder(input);

    // 42 / 1.15 = 36.52 (ex-VAT), VAT = 5.48
    expect(result.meta.subtotalExVat).toBe(36.52);
    expect(result.meta.vatAmount).toBe(5.48);
    expect(result.meta.totalInclVat).toBe(42);
    expect(result.request.payments[0]!.amount).toBe('42.00000');
  });

  it('should handle beef at SAR 35', () => {
    const input: FlodMealCollectionInput = {
      ...baseInput,
      unitPriceInclVat: 35,
    };
    const result = buildFoodicsOrder(input);

    // 35 / 1.15 = 30.43 (ex-VAT), VAT = 4.57
    expect(result.meta.subtotalExVat).toBe(30.43);
    expect(result.meta.vatAmount).toBe(4.57);
    expect(result.meta.totalInclVat).toBe(35);
  });

  it('should include modifier options for carb, sauce, vegetables', () => {
    const input: FlodMealCollectionInput = {
      ...baseInput,
      modifierOptionIds: ['mod-carb-uuid', 'mod-sauce-uuid', 'mod-veg-uuid'],
    };
    const result = buildFoodicsOrder(input);

    expect(result.request.products[0]!.options).toHaveLength(3);
    expect(result.request.products[0]!.options![0]!.modifier_option_id).toBe('mod-carb-uuid');
    expect(result.request.products[0]!.options![1]!.modifier_option_id).toBe('mod-sauce-uuid');
    expect(result.request.products[0]!.options![2]!.modifier_option_id).toBe('mod-veg-uuid');
    // All modifiers have quantity 1
    expect(result.request.products[0]!.options![0]!.quantity).toBe(1);
  });

  it('should include notes when provided', () => {
    const input: FlodMealCollectionInput = {
      ...baseInput,
      notes: 'No onion please',
    };
    const result = buildFoodicsOrder(input);

    expect(result.request.products[0]!.notes).toBe('No onion please');
  });

  it('should not include options when no modifiers', () => {
    const result = buildFoodicsOrder(baseInput);

    expect(result.request.products[0]!.options).toBeUndefined();
  });

  it('should not include notes when empty', () => {
    const result = buildFoodicsOrder(baseInput);

    expect(result.request.products[0]!.notes).toBeUndefined();
  });

  it('should apply per-line discount', () => {
    const input: FlodMealCollectionInput = {
      ...baseInput,
      unitPriceInclVat: 24,
      discountAmount: 2.09, // 10% off ex-VAT 20.87 = 2.09
    };
    const result = buildFoodicsOrder(input);

    expect(result.request.products[0]!.discount_amount).toBe('2.09000');
    // Payment should be total minus discount: 24 - 2.09 = 21.91
    expect(result.request.payments[0]!.amount).toBe('21.91000');
  });

  it('should omit customer_id when not provided', () => {
    const input: FlodMealCollectionInput = {
      ...baseInput,
      foodicsCustomerId: undefined,
    };
    const result = buildFoodicsOrder(input);

    expect(result.request.customer_id).toBeUndefined();
  });

  it('should handle zero price (free items)', () => {
    const input: FlodMealCollectionInput = {
      ...baseInput,
      unitPriceInclVat: 0,
    };
    const result = buildFoodicsOrder(input);

    expect(result.meta.totalInclVat).toBe(0);
    expect(result.meta.subtotalExVat).toBe(0);
    expect(result.meta.vatAmount).toBe(0);
    expect(result.request.payments[0]!.amount).toBe('0.00000');
  });

  it('should handle quantity > 1', () => {
    const input: FlodMealCollectionInput = {
      ...baseInput,
      quantity: 2,
    };
    const result = buildFoodicsOrder(input);

    expect(result.request.products[0]!.quantity).toBe(2);
    expect(result.meta.totalInclVat).toBe(48); // 24 * 2
    expect(result.meta.subtotalExVat).toBe(41.74); // 20.87 * 2
    expect(result.meta.vatAmount).toBe(6.26); // 3.13 * 2
    expect(result.request.payments[0]!.amount).toBe('48.00000');
  });
});

describe('validateFoodicsMappings', () => {
  it('should return empty array when all mappings exist', () => {
    const result = validateFoodicsMappings({
      foodicsBranchId: 'branch-uuid',
      foodicsProductId: 'product-uuid',
      foodicsPaymentMethodId: 'pm-uuid',
    });
    expect(result).toEqual([]);
  });

  it('should report missing branch ID', () => {
    const result = validateFoodicsMappings({
      foodicsBranchId: null,
      foodicsProductId: 'product-uuid',
      foodicsPaymentMethodId: 'pm-uuid',
    });
    expect(result).toEqual(['foodics_branch_id']);
  });

  it('should report all missing mappings', () => {
    const result = validateFoodicsMappings({
      foodicsBranchId: null,
      foodicsProductId: null,
      foodicsPaymentMethodId: null,
    });
    expect(result).toEqual(['foodics_branch_id', 'foodics_product_id', 'foodics_payment_method_id']);
  });
});
