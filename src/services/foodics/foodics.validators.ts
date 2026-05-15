/**
 * Zod schemas for runtime validation of Foodics API v5 responses.
 *
 * Validates external API data at the boundary before it enters
 * the FLOD system. Catches shape mismatches early.
 */

import { z } from 'zod';

// ── Shared Primitives ───────────────────────────────────────────────

const foodicsId = z.string().uuid();
const foodicsAmount = z.string();
const foodicsDateTime = z.string();

// ── Branch ──────────────────────────────────────────────────────────

export const foodicsBranchSchema = z.object({
  id: foodicsId,
  name: z.string(),
  name_localized: z.string(),
  reference: z.string(),
  type: z.number(),
  phone: z.string().nullable(),
  latitude: z.string().nullable(),
  longitude: z.string().nullable(),
  is_active: z.boolean(),
  created_at: foodicsDateTime,
  updated_at: foodicsDateTime,
});

// ── Product / Category ──────────────────────────────────────────────

export const foodicsCategorySchema = z.object({
  id: foodicsId,
  name: z.string(),
  name_localized: z.string(),
  reference: z.string().nullable(),
  is_active: z.boolean(),
});

export const foodicsProductSchema = z.object({
  id: foodicsId,
  name: z.string(),
  name_localized: z.string(),
  sku: z.string().nullable(),
  barcode: z.string().nullable(),
  description: z.string().nullable(),
  description_localized: z.string().nullable(),
  price: foodicsAmount,
  cost: foodicsAmount.nullable(),
  category_id: foodicsId,
  is_active: z.boolean(),
  is_stock_product: z.boolean(),
  taxable: z.boolean(),
  tax_inclusive: z.boolean(),
  created_at: foodicsDateTime,
  updated_at: foodicsDateTime,
});

export const foodicsModifierOptionSchema = z.object({
  id: foodicsId,
  name: z.string(),
  name_localized: z.string(),
  sku: z.string().nullable(),
  price: foodicsAmount,
  is_active: z.boolean(),
  modifier_id: foodicsId,
});

// ── Customer ────────────────────────────────────────────────────────

export const foodicsCustomerSchema = z.object({
  id: foodicsId,
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  dial_code: z.string().nullable(),
  gender: z.number().nullable(),
  birth_date: z.string().nullable(),
  is_blacklisted: z.boolean(),
  notes: z.string().nullable(),
  house_account_balance: foodicsAmount,
  loyalty_points: z.number(),
  created_at: foodicsDateTime,
  updated_at: foodicsDateTime,
});

// ── Payment Method ──────────────────────────────────────────────────

export const foodicsPaymentMethodSchema = z.object({
  id: foodicsId,
  name: z.string(),
  name_localized: z.string(),
  code: z.string().nullable(),
  type: z.number(),
  is_active: z.boolean(),
});

// ── Tax ─────────────────────────────────────────────────────────────

export const foodicsTaxSchema = z.object({
  id: foodicsId,
  name: z.string(),
  name_localized: z.string(),
  rate: foodicsAmount,
  is_active: z.boolean(),
  is_inclusive: z.boolean(),
});

// ── Settings ────────────────────────────────────────────────────────

export const foodicsSettingsSchema = z.object({
  tax_inclusive_pricing: z.boolean(),
  currency: z.string(),
  timezone: z.string(),
  country_code: z.string(),
});

// ── Order ───────────────────────────────────────────────────────────

export const foodicsOrderSchema = z.object({
  id: foodicsId,
  reference: z.string(),
  branch_id: foodicsId,
  customer_id: foodicsId.nullable(),
  type: z.number(),
  status: z.number(),
  subtotal_price: foodicsAmount,
  tax_amount: foodicsAmount,
  total_price: foodicsAmount,
  discount_amount: foodicsAmount,
  rounding_amount: foodicsAmount,
  due_amount: foodicsAmount,
  business_date: z.string(),
  created_at: foodicsDateTime,
  updated_at: foodicsDateTime,
  products: z.array(
    z.object({
      id: foodicsId,
      product_id: foodicsId,
      product_name: z.string(),
      quantity: z.number(),
      unit_price: foodicsAmount,
      total_price: foodicsAmount,
      tax_amount: foodicsAmount,
      discount_amount: foodicsAmount,
      notes: z.string().nullable(),
    }),
  ),
  payments: z.array(
    z.object({
      id: foodicsId,
      payment_method_id: foodicsId,
      amount: foodicsAmount,
    }),
  ),
});

// ── Orders Calculator ───────────────────────────────────────────────

export const foodicsOrdersCalculatorResponseSchema = z.object({
  subtotal_price: foodicsAmount,
  tax_amount: foodicsAmount,
  total_price: foodicsAmount,
  discount_amount: foodicsAmount,
  rounding_amount: foodicsAmount,
  products: z.array(
    z.object({
      product_id: foodicsId,
      quantity: z.number(),
      unit_price: foodicsAmount,
      total_price: foodicsAmount,
      tax_amount: foodicsAmount,
      discount_amount: foodicsAmount,
    }),
  ),
});

// ── Paginated Wrapper ───────────────────────────────────────────────

export function foodicsPaginatedSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    meta: z.object({
      current_page: z.number(),
      from: z.number().nullable(),
      last_page: z.number(),
      per_page: z.number(),
      to: z.number().nullable(),
      total: z.number(),
    }),
  });
}

export function foodicsSingleSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: itemSchema,
  });
}
