/**
 * Foodics API v5 TypeScript types.
 *
 * Covers all Foodics API request/response shapes needed for FLOD integration:
 * - Orders (create, calculator)
 * - Products, Categories, Branches
 * - Customers, House Accounts
 * - Payment Methods, Taxes
 * - Webhooks
 *
 * Reference: https://docs.foodics.com
 */

// ── Core Primitives ─────────────────────────────────────────────────

/** Foodics uses UUIDv4 for all entity identifiers */
export type FoodicsId = string;

/** Foodics monetary amounts as strings with 5 decimal precision */
export type FoodicsAmount = string;

/** ISO 8601 datetime strings from Foodics API */
export type FoodicsDateTime = string;

// ── Pagination ──────────────────────────────────────────────────────

export interface FoodicsPaginatedResponse<T> {
  data: T[];
  meta: {
    current_page: number;
    from: number;
    last_page: number;
    per_page: number;
    to: number;
    total: number;
  };
}

export interface FoodicsSingleResponse<T> {
  data: T;
}

// ── Branch ──────────────────────────────────────────────────────────

export interface FoodicsBranch {
  id: FoodicsId;
  name: string;
  name_localized: string;
  reference: string;
  type: number; // 1=dine_in, 2=take_away, 3=pickup, 4=delivery, 5=drive_thru
  phone: string | null;
  latitude: string | null;
  longitude: string | null;
  is_active: boolean;
  created_at: FoodicsDateTime;
  updated_at: FoodicsDateTime;
}

// ── Product / Category ──────────────────────────────────────────────

export interface FoodicsCategory {
  id: FoodicsId;
  name: string;
  name_localized: string;
  reference: string | null;
  is_active: boolean;
}

export interface FoodicsProduct {
  id: FoodicsId;
  name: string;
  name_localized: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  description_localized: string | null;
  price: FoodicsAmount;
  cost: FoodicsAmount | null;
  category_id: FoodicsId;
  is_active: boolean;
  is_stock_product: boolean;
  taxable: boolean;
  tax_inclusive: boolean;
  created_at: FoodicsDateTime;
  updated_at: FoodicsDateTime;
}

export interface FoodicsModifierOption {
  id: FoodicsId;
  name: string;
  name_localized: string;
  sku: string | null;
  price: FoodicsAmount;
  is_active: boolean;
  modifier_id: FoodicsId;
}

// ── Customer / House Account ────────────────────────────────────────

export interface FoodicsCustomer {
  id: FoodicsId;
  name: string;
  email: string | null;
  phone: string | null;
  dial_code: string | null;
  gender: number | null; // 1=male, 2=female
  birth_date: string | null;
  is_blacklisted: boolean;
  notes: string | null;
  house_account_balance: FoodicsAmount;
  loyalty_points: number;
  created_at: FoodicsDateTime;
  updated_at: FoodicsDateTime;
}

export interface FoodicsCreateCustomerRequest {
  name: string;
  phone?: string;
  dial_code?: string;
  email?: string;
  gender?: 1 | 2;
  birth_date?: string;
  notes?: string;
}

export interface FoodicsHouseAccountTransaction {
  id: FoodicsId;
  customer_id: FoodicsId;
  amount: FoodicsAmount;
  type: 1 | 2; // 1=credit, 2=debit
  notes: string | null;
  created_at: FoodicsDateTime;
}

export interface FoodicsHouseAccountTransactionRequest {
  customer_id: FoodicsId;
  amount: string;
  type: 1 | 2; // 1=credit, 2=debit
  notes?: string;
}

// ── Payment Method ──────────────────────────────────────────────────

export interface FoodicsPaymentMethod {
  id: FoodicsId;
  name: string;
  name_localized: string;
  code: string | null;
  type: number;
  // Type 1 = Cash
  // Type 2 = Credit Card
  // Type 3 = Online Payment
  // Type 4 = Voucher
  // Type 5 = Loyalty
  // Type 6 = Gift Card
  // Type 7 = House Account
  // Type 8 = External
  is_active: boolean;
}

// ── Tax ─────────────────────────────────────────────────────────────

export interface FoodicsTax {
  id: FoodicsId;
  name: string;
  name_localized: string;
  rate: FoodicsAmount; // e.g. "15.00000" for 15%
  is_active: boolean;
  is_inclusive: boolean;
}

// ── Settings ────────────────────────────────────────────────────────

export interface FoodicsSettings {
  tax_inclusive_pricing: boolean;
  currency: string;
  timezone: string;
  country_code: string;
}

// ── Orders ──────────────────────────────────────────────────────────

export interface FoodicsOrderProduct {
  product_id: FoodicsId;
  quantity: number;
  unit_price?: FoodicsAmount;
  notes?: string;
  options?: FoodicsOrderProductOption[];
  discount_amount?: FoodicsAmount;
}

export interface FoodicsOrderProductOption {
  modifier_option_id: FoodicsId;
  quantity?: number;
}

export interface FoodicsOrderPayment {
  payment_method_id: FoodicsId;
  amount: FoodicsAmount;
  tendered?: FoodicsAmount;
}

export interface FoodicsCreateOrderRequest {
  branch_id: FoodicsId;
  type: 1 | 2 | 3 | 4 | 5; // 1=dine_in, 2=take_away, 3=pickup, 4=delivery, 5=drive_thru
  customer_id?: FoodicsId;
  products: FoodicsOrderProduct[];
  payments: FoodicsOrderPayment[];
  notes?: string;
  reference?: string; // FLOD internal reference (e.g. subscription_daily_meal ID)
  discount_amount?: FoodicsAmount;
  tax_exclusive_discount_amount?: FoodicsAmount;
}

export interface FoodicsOrder {
  id: FoodicsId;
  reference: string;
  branch_id: FoodicsId;
  customer_id: FoodicsId | null;
  type: number;
  status: number;
  // Status: 1=active, 2=closed, 3=void, 4=returned
  subtotal_price: FoodicsAmount;
  tax_amount: FoodicsAmount;
  total_price: FoodicsAmount;
  discount_amount: FoodicsAmount;
  rounding_amount: FoodicsAmount;
  due_amount: FoodicsAmount;
  business_date: string;
  created_at: FoodicsDateTime;
  updated_at: FoodicsDateTime;
  products: FoodicsOrderProductResult[];
  payments: FoodicsOrderPaymentResult[];
}

export interface FoodicsOrderProductResult {
  id: FoodicsId;
  product_id: FoodicsId;
  product_name: string;
  quantity: number;
  unit_price: FoodicsAmount;
  total_price: FoodicsAmount;
  tax_amount: FoodicsAmount;
  discount_amount: FoodicsAmount;
  notes: string | null;
}

export interface FoodicsOrderPaymentResult {
  id: FoodicsId;
  payment_method_id: FoodicsId;
  amount: FoodicsAmount;
}

// ── Orders Calculator ───────────────────────────────────────────────

export interface FoodicsOrdersCalculatorRequest {
  branch_id: FoodicsId;
  products: FoodicsOrderProduct[];
  customer_id?: FoodicsId;
  discount_amount?: FoodicsAmount;
}

export interface FoodicsOrdersCalculatorResponse {
  subtotal_price: FoodicsAmount;
  tax_amount: FoodicsAmount;
  total_price: FoodicsAmount;
  discount_amount: FoodicsAmount;
  rounding_amount: FoodicsAmount;
  products: Array<{
    product_id: FoodicsId;
    quantity: number;
    unit_price: FoodicsAmount;
    total_price: FoodicsAmount;
    tax_amount: FoodicsAmount;
    discount_amount: FoodicsAmount;
  }>;
}

// ── Webhooks ────────────────────────────────────────────────────────

export interface FoodicsWebhookSubscription {
  id: FoodicsId;
  url: string;
  event: string;
  // Events: order.created, order.updated, order.closed, etc.
  is_active: boolean;
  secret: string;
}

export interface FoodicsCreateWebhookRequest {
  url: string;
  event: string;
  is_active?: boolean;
}

// ── Error Response ──────────────────────────────────────────────────

export interface FoodicsErrorResponse {
  message: string;
  errors?: Record<string, string[]>;
}

// ── FLOD Integration Types ──────────────────────────────────────────

/** Status of a Foodics sync attempt for a FLOD meal */
export type FoodicsSyncStatus = 'pending' | 'synced' | 'failed' | 'retrying';

/** Input for building a Foodics order from FLOD meal collection data */
export interface FlodMealCollectionInput {
  /** subscription_daily_meals.id — used as reference */
  mealId: string;
  /** Foodics branch UUID (from branches.foodics_branch_id) */
  foodicsBranchId: FoodicsId;
  /** Foodics product UUID (from products.foodics_product_id) */
  foodicsProductId: FoodicsId;
  /** Foodics customer UUID (from users.foodics_customer_id) */
  foodicsCustomerId?: FoodicsId;
  /** Foodics House Account payment method UUID */
  foodicsPaymentMethodId: FoodicsId;
  /** VAT-inclusive unit price in SAR */
  unitPriceInclVat: number;
  /** Number of items (typically 1 for meal collection) */
  quantity: number;
  /** Optional modifier option IDs (carb, sauce, vegetables) */
  modifierOptionIds?: FoodicsId[];
  /** Optional notes (e.g. "No onion") */
  notes?: string;
  /** Optional per-line discount amount in SAR */
  discountAmount?: number;
}

/** Output of the Foodics order builder */
export interface FoodicsOrderPayload {
  request: FoodicsCreateOrderRequest;
  meta: {
    flodMealId: string;
    totalInclVat: number;
    vatAmount: number;
    subtotalExVat: number;
  };
}
