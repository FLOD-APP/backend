import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  numeric,
  timestamp,
  date,
  time,
  unique,
  index,
  jsonb,
} from 'drizzle-orm/pg-core';

// ============================================
// ENUMS
// ============================================

export const priceTierEnum = pgEnum('price_tier', [
  'base',
  'subscription',
  'express_base',
  'express_subscription',
  'app',
]);

export const packageCategoryEnum = pgEnum('package_category', [
  'mixed',
  'chicken',
  'snack',
  'sandwich',
  'customer_choice',
]);

export const rotationTypeEnum = pgEnum('rotation_type', ['snack', 'sandwich']);

export const branchTypeEnum = pgEnum('branch_type', ['main', 'express']);

export const expressClassificationEnum = pgEnum('express_classification', ['buffet', 'grab_and_go']);

export const discountTypeEnum = pgEnum('discount_type', ['first_plan', 'renewal', 'promo_code', 'seasonal']);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'pending_payment',
  'active',
  'paused',
  'expired',
  'cancelled',
]);

export const fulfilmentModeEnum = pgEnum('fulfilment_mode', ['pickup', 'delivery']);

export const foodicsSyncStatusEnum = pgEnum('foodics_sync_status', ['pending', 'synced', 'failed', 'retrying']);

// ============================================
// PRODUCTS & PRICING
// ============================================

export const productCategories = pgTable('product_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  nameEn: text('name_en').unique().notNull(),
  nameAr: text('name_ar').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  inSubscription: boolean('in_subscription').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => productCategories.id),
  sku: text('sku').unique(),
  nameEn: text('name_en').notNull(),
  nameAr: text('name_ar').notNull(),
  descriptionEn: text('description_en'),
  descriptionAr: text('description_ar'),
  calories: integer('calories'),
  proteinG: numeric('protein_g', { precision: 5, scale: 1 }),
  carbsG: numeric('carbs_g', { precision: 5, scale: 1 }),
  fatG: numeric('fat_g', { precision: 5, scale: 1 }),
  servingSizeG: integer('serving_size_g'),
  allergens: text('allergens').array(),
  isActive: boolean('is_active').notNull().default(true),
  isFree: boolean('is_free').notNull().default(false),
  proteinType: text('protein_type'), // chicken, beef, salmon, shrimp, almond_fish, NULL
  foodicsProductId: text('foodics_product_id'), // Foodics API product UUID
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const productPrices = pgTable(
  'product_prices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    tier: priceTierEnum('tier').notNull(),
    branchId: uuid('branch_id').references(() => branches.id),
    priceInclVat: numeric('price_incl_vat', { precision: 8, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('SAR'),
    effectiveFrom: date('effective_from').notNull().defaultNow(),
    effectiveTo: date('effective_to'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('product_prices_unique').on(table.productId, table.tier, table.branchId, table.effectiveFrom)],
);

// ============================================
// PACKAGES
// ============================================

export const packages = pgTable(
  'packages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    category: packageCategoryEnum('category').notNull(),
    nameEn: text('name_en').notNull(),
    nameAr: text('name_ar').notNull(),
    mealsPerDay: integer('meals_per_day').notNull(),
    durationDays: integer('duration_days').notNull(),
    totalMeals: integer('total_meals').notNull(),
    priceInclVat: numeric('price_incl_vat', { precision: 8, scale: 2 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('packages_unique').on(table.category, table.mealsPerDay, table.durationDays)],
);

export const packageMealDistribution = pgTable(
  'package_meal_distribution',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    packageId: uuid('package_id')
      .notNull()
      .references(() => packages.id),
    proteinType: text('protein_type').notNull(),
    mealCount: integer('meal_count').notNull(),
  },
  (table) => [unique('package_meal_dist_unique').on(table.packageId, table.proteinType)],
);

// ============================================
// SNACK & SANDWICH ROTATIONS
// ============================================

export const rotationSchedules = pgTable(
  'rotation_schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: rotationTypeEnum('type').notNull(),
    dayNumber: integer('day_number').notNull(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    priceInclVat: numeric('price_incl_vat', { precision: 8, scale: 2 }).notNull(),
  },
  (table) => [unique('rotation_schedule_unique').on(table.type, table.dayNumber)],
);

export const rotationSwapOptions = pgTable(
  'rotation_swap_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scheduleId: uuid('schedule_id')
      .notNull()
      .references(() => rotationSchedules.id),
    swapProductId: uuid('swap_product_id')
      .notNull()
      .references(() => products.id),
  },
  (table) => [unique('rotation_swap_unique').on(table.scheduleId, table.swapProductId)],
);

// ============================================
// BRANCHES
// ============================================

export const branches = pgTable('branches', {
  id: uuid('id').primaryKey().defaultRandom(),
  foodicsRef: text('foodics_ref').unique().notNull(),
  foodicsBranchId: text('foodics_branch_id'), // Foodics API branch UUID (supplements B01-B18 refs)
  nameEn: text('name_en').notNull(),
  nameAr: text('name_ar').notNull(),
  type: branchTypeEnum('type').notNull(),
  expressClassification: expressClassificationEnum('express_classification'),
  managerName: text('manager_name'),
  latitude: numeric('latitude', { precision: 10, scale: 7 }),
  longitude: numeric('longitude', { precision: 10, scale: 7 }),
  googleMapsUrl: text('google_maps_url'),
  openHour: time('open_hour'),
  closeHour: time('close_hour'),
  isActive: boolean('is_active').notNull().default(true),
  isStage0: boolean('is_stage0').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================
// DISCOUNTS & PROMOS
// ============================================

export const discountRules = pgTable('discount_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: discountTypeEnum('type').notNull(),
  code: text('code').unique(),
  discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }).notNull(),
  appliesTo: text('applies_to').array().notNull().default(['main_meals']),
  maxUses: integer('max_uses'),
  currentUses: integer('current_uses').notNull().default(0),
  validFrom: timestamp('valid_from', { withTimezone: true }),
  validTo: timestamp('valid_to', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================
// SYSTEM SETTINGS
// ============================================

export const systemSettings = pgTable('system_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  description: text('description'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by'),
});

// ============================================
// SUBSCRIPTIONS & WALLET
// ============================================

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  packageId: uuid('package_id')
    .notNull()
    .references(() => packages.id),
  branchId: uuid('branch_id')
    .notNull()
    .references(() => branches.id),
  fulfilment: fulfilmentModeEnum('fulfilment').notNull().default('pickup'),
  status: subscriptionStatusEnum('status').notNull().default('pending_payment'),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  currentDay: integer('current_day').notNull().default(0),
  totalDays: integer('total_days').notNull(),
  pauseDaysUsed: integer('pause_days_used').notNull().default(0),
  pauseDaysLimit: integer('pause_days_limit').notNull(),
  discountId: uuid('discount_id').references(() => discountRules.id),
  discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }).default('0'),
  amountPaid: numeric('amount_paid', { precision: 8, scale: 2 }).notNull(),
  walletBalance: numeric('wallet_balance', { precision: 8, scale: 2 }).notNull().default('0'),
  paymentId: text('payment_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const walletTransactions = pgTable('wallet_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id')
    .notNull()
    .references(() => subscriptions.id),
  type: text('type').notNull(),
  amount: numeric('amount', { precision: 8, scale: 2 }).notNull(),
  balanceAfter: numeric('balance_after', { precision: 8, scale: 2 }).notNull(),
  description: text('description'),
  mealId: uuid('meal_id'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================
// DAILY MEAL SCHEDULE
// ============================================

export const subscriptionDailyMeals = pgTable(
  'subscription_daily_meals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id),
    dayNumber: integer('day_number').notNull(),
    mealSlot: integer('meal_slot').notNull().default(1),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    priceInclVat: numeric('price_incl_vat', { precision: 8, scale: 2 }).notNull(),
    isCollected: boolean('is_collected').notNull().default(false),
    collectedAt: timestamp('collected_at', { withTimezone: true }),
    isSwapped: boolean('is_swapped').notNull().default(false),
    swappedFromId: uuid('swapped_from_id').references(() => products.id),
    swapPriceDiff: numeric('swap_price_diff', { precision: 8, scale: 2 }).default('0'),
    // Foodics sync tracking
    foodicsOrderId: text('foodics_order_id'),
    foodicsSyncedAt: timestamp('foodics_synced_at', { withTimezone: true }),
    foodicsSyncStatus: foodicsSyncStatusEnum('foodics_sync_status'),
  },
  (table) => [unique('sub_daily_meals_unique').on(table.subscriptionId, table.dayNumber, table.mealSlot)],
);

// ============================================
// USERS & AUTH (beyond handover)
// ============================================

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: text('phone').unique().notNull(),
  name: text('name'),
  email: text('email'),
  languagePreference: text('language_preference').notNull().default('ar'),
  foodicsCustomerId: text('foodics_customer_id'), // Foodics API customer UUID
  // Onboarding fields
  gender: text('gender'),
  dateOfBirth: date('date_of_birth'),
  goal: text('goal'),
  activityLevel: text('activity_level'),
  heightCm: numeric('height_cm', { precision: 5, scale: 1 }),
  weightKg: numeric('weight_kg', { precision: 5, scale: 1 }),
  targetWeightKg: numeric('target_weight_kg', { precision: 5, scale: 1 }),
  allergies: text('allergies').array(),
  whyReasons: text('why_reasons').array(),
  dailyCalories: integer('daily_calories'),
  proteinGrams: numeric('protein_grams', { precision: 5, scale: 1 }),
  carbsGrams: numeric('carbs_grams', { precision: 5, scale: 1 }),
  fatGrams: numeric('fat_grams', { precision: 5, scale: 1 }),
  onboardingComplete: boolean('onboarding_complete').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const otpCodes = pgTable('otp_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: text('phone').notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  used: boolean('used').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revoked: boolean('revoked').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const checkIns = pgTable('check_ins', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id')
    .notNull()
    .references(() => subscriptions.id),
  branchId: uuid('branch_id')
    .notNull()
    .references(() => branches.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  status: text('status').notNull().default('waiting'),
  checkedInAt: timestamp('checked_in_at', { withTimezone: true }).notNull().defaultNow(),
  statusUpdatedAt: timestamp('status_updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================
// ONBOARDING: GOAL→WHY MATRIX
// ============================================

export const goalWhyMatrix = pgTable('goal_why_matrix', {
  goal: text('goal').primaryKey(),
  topReasons: jsonb('top_reasons').notNull().default([]),
  lockedReasons: jsonb('locked_reasons').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================
// FOODICS SYNC LOG
// ============================================

export const foodicsSyncLog = pgTable(
  'foodics_sync_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mealId: uuid('meal_id')
      .notNull()
      .references(() => subscriptionDailyMeals.id),
    status: foodicsSyncStatusEnum('status').notNull().default('pending'),
    foodicsOrderId: text('foodics_order_id'),
    attempt: integer('attempt').notNull().default(1),
    errorMessage: text('error_message'),
    requestPayload: jsonb('request_payload'),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('foodics_sync_log_status_retry_idx').on(table.status, table.nextRetryAt),
    index('foodics_sync_log_meal_idx').on(table.mealId),
  ],
);
