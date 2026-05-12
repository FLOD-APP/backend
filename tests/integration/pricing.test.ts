import request from 'supertest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../../src/db/schema.js';
import { PricingService } from '../../src/services/pricing.service.js';
import { createApp } from '../../src/app.js';
import { signAccessToken } from '../../src/utils/jwt.js';

const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://flod:flod_dev_password@localhost:5433/flod_dev';
const JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long!!';
const JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-chars!!';

let sql: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle<typeof schema>>;
let pricingService: PricingService;
let app: ReturnType<typeof createApp>;
let token: string;

// Test data IDs
let testUserId: string;
let mixedPackageId: string;   // a main-meals package (discountable)
let snackPackageId: string;   // a snack package (not discountable)
let promoRuleId: string;
let expiredPromoId: string;
let usedUpPromoId: string;
let inactivePromoId: string;

const TEST_PHONE = '+966500000099';

beforeAll(async () => {
  process.env['JWT_SECRET'] = JWT_SECRET;
  process.env['JWT_REFRESH_SECRET'] = JWT_REFRESH_SECRET;

  sql = postgres(DATABASE_URL, { max: 2 });
  db = drizzle(sql, { schema });
  pricingService = new PricingService(db);

  app = createApp({
    checkDb: async () => true,
    version: '0.1.0-test',
    db,
  });

  // Create a test user
  const userRows = await sql`
    INSERT INTO users (phone) VALUES (${TEST_PHONE})
    ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
    RETURNING id
  `;
  testUserId = userRows[0]!['id'] as string;
  token = signAccessToken({ userId: testUserId, phone: TEST_PHONE });

  // Get a mixed package (discountable) and a snack package (not discountable)
  const mixedRows = await sql`
    SELECT id FROM packages WHERE category = 'mixed' AND is_active = true LIMIT 1
  `;
  mixedPackageId = mixedRows[0]!['id'] as string;

  const snackRows = await sql`
    SELECT id FROM packages WHERE category = 'snack' AND is_active = true LIMIT 1
  `;
  snackPackageId = snackRows[0]!['id'] as string;

  // Create test promo codes
  const promoRows = await sql`
    INSERT INTO discount_rules (type, code, discount_percent, applies_to, max_uses, current_uses, valid_from, valid_to, is_active)
    VALUES
      ('promo_code', 'TESTPROMO15', '15.00', ARRAY['main_meals'], 100, 0, NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days', true),
      ('promo_code', 'EXPIREDPROMO', '10.00', ARRAY['main_meals'], 100, 0, NOW() - INTERVAL '60 days', NOW() - INTERVAL '1 day', true),
      ('promo_code', 'USEDUP', '10.00', ARRAY['main_meals'], 5, 5, NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days', true),
      ('promo_code', 'INACTIVEPROMO', '10.00', ARRAY['main_meals'], 100, 0, NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days', false)
    RETURNING id
  `;
  promoRuleId = promoRows[0]!['id'] as string;
  expiredPromoId = promoRows[1]!['id'] as string;
  usedUpPromoId = promoRows[2]!['id'] as string;
  inactivePromoId = promoRows[3]!['id'] as string;
});

afterAll(async () => {
  // Clean up test data
  await sql`DELETE FROM subscriptions WHERE user_id = ${testUserId}::uuid`;
  await sql`DELETE FROM discount_rules WHERE code IN ('TESTPROMO15', 'EXPIREDPROMO', 'USEDUP', 'INACTIVEPROMO')`;
  await sql`DELETE FROM users WHERE phone = ${TEST_PHONE}`;
  await sql.end();
  delete process.env['JWT_SECRET'];
  delete process.env['JWT_REFRESH_SECRET'];
});

// ─── R9.AC3: Discount Resolution ──────────────────────────────
describe('resolveDiscount', () => {
  it('R9.AC3: new user (no subs) gets first_plan 10% discount', async () => {
    const discount = await pricingService.resolveDiscount(testUserId);

    expect(discount.type).toBe('first_plan');
    expect(discount.percent).toBe(10);
    expect(discount.discountRuleId).toBeNull();
  });

  it('R9.AC3: user with past subscriptions gets renewal 5% discount', async () => {
    // Create a past subscription for the user
    const branchRows = await sql`SELECT id FROM branches WHERE is_active = true LIMIT 1`;
    const branchId = branchRows[0]!['id'] as string;

    await sql`
      INSERT INTO subscriptions (user_id, package_id, branch_id, status, start_date, end_date, total_days, pause_days_limit, amount_paid)
      VALUES (${testUserId}::uuid, ${mixedPackageId}::uuid, ${branchId}::uuid, 'expired', '2026-01-01', '2026-01-12', 12, 3, '288.00')
    `;

    const discount = await pricingService.resolveDiscount(testUserId);

    expect(discount.type).toBe('renewal');
    expect(discount.percent).toBe(5);
    expect(discount.discountRuleId).toBeNull();

    // Clean up
    await sql`DELETE FROM subscriptions WHERE user_id = ${testUserId}::uuid`;
  });

  it('R9.AC3: promo code takes priority over first_plan', async () => {
    const discount = await pricingService.resolveDiscount(testUserId, 'TESTPROMO15');

    expect(discount.type).toBe('promo_code');
    expect(discount.percent).toBe(15);
    expect(discount.discountRuleId).toBe(promoRuleId);
  });

  it('R9.AC3: promo code takes priority over renewal', async () => {
    // Create a past subscription
    const branchRows = await sql`SELECT id FROM branches WHERE is_active = true LIMIT 1`;
    const branchId = branchRows[0]!['id'] as string;

    await sql`
      INSERT INTO subscriptions (user_id, package_id, branch_id, status, start_date, end_date, total_days, pause_days_limit, amount_paid)
      VALUES (${testUserId}::uuid, ${mixedPackageId}::uuid, ${branchId}::uuid, 'expired', '2026-01-01', '2026-01-12', 12, 3, '288.00')
    `;

    const discount = await pricingService.resolveDiscount(testUserId, 'TESTPROMO15');

    expect(discount.type).toBe('promo_code');
    expect(discount.percent).toBe(15);

    await sql`DELETE FROM subscriptions WHERE user_id = ${testUserId}::uuid`;
  });
});

// ─── R9.AC6: Settings-driven discount rates ─────────────────
describe('R9.AC6: discount rates from system_settings', () => {
  let originalFirstPlan: string;
  let originalRenewal: string;

  beforeAll(async () => {
    const rows = await sql`SELECT key, value FROM system_settings WHERE key IN ('first_plan_discount_percent', 'renewal_discount_percent')`;
    originalFirstPlan = (rows.find(r => r['key'] === 'first_plan_discount_percent') as { value: string })['value'];
    originalRenewal = (rows.find(r => r['key'] === 'renewal_discount_percent') as { value: string })['value'];
  });

  afterAll(async () => {
    await sql`UPDATE system_settings SET value = ${originalFirstPlan} WHERE key = 'first_plan_discount_percent'`;
    await sql`UPDATE system_settings SET value = ${originalRenewal} WHERE key = 'renewal_discount_percent'`;
  });

  it('reads first_plan_discount_percent from settings, not hardcoded', async () => {
    await sql`UPDATE system_settings SET value = '20' WHERE key = 'first_plan_discount_percent'`;

    const discount = await pricingService.resolveDiscount(testUserId);

    expect(discount.type).toBe('first_plan');
    expect(discount.percent).toBe(20);
  });

  it('reads renewal_discount_percent from settings, not hardcoded', async () => {
    await sql`UPDATE system_settings SET value = '8' WHERE key = 'renewal_discount_percent'`;

    // Create a past subscription
    const branchRows = await sql`SELECT id FROM branches WHERE is_active = true LIMIT 1`;
    const branchId = branchRows[0]!['id'] as string;

    await sql`
      INSERT INTO subscriptions (user_id, package_id, branch_id, status, start_date, end_date, total_days, pause_days_limit, amount_paid)
      VALUES (${testUserId}::uuid, ${mixedPackageId}::uuid, ${branchId}::uuid, 'expired', '2026-01-01', '2026-01-12', 12, 3, '288.00')
    `;

    const discount = await pricingService.resolveDiscount(testUserId);

    expect(discount.type).toBe('renewal');
    expect(discount.percent).toBe(8);

    await sql`DELETE FROM subscriptions WHERE user_id = ${testUserId}::uuid`;
  });
});

// ─── R9.AC7 + R9.AC8: Promo Validation ──────────────────────
describe('validatePromo', () => {
  it('R9.AC7: valid promo returns discount percent', async () => {
    const result = await pricingService.validatePromo('TESTPROMO15');

    expect(result.discountPercent).toBe(15);
    expect(result.type).toBe('promo_code');
    expect(result.ruleId).toBe(promoRuleId);
  });

  it('R9.AC8: PROMO_NOT_FOUND for nonexistent code', async () => {
    await expect(pricingService.validatePromo('NONEXISTENT')).rejects.toMatchObject({
      code: 'PROMO_NOT_FOUND',
      statusCode: 400,
    });
  });

  it('R9.AC8: PROMO_EXPIRED for expired code', async () => {
    await expect(pricingService.validatePromo('EXPIREDPROMO')).rejects.toMatchObject({
      code: 'PROMO_EXPIRED',
      statusCode: 400,
    });
  });

  it('R9.AC8: PROMO_LIMIT_REACHED for used up code', async () => {
    await expect(pricingService.validatePromo('USEDUP')).rejects.toMatchObject({
      code: 'PROMO_LIMIT_REACHED',
      statusCode: 400,
    });
  });

  it('R9.AC8: PROMO_INACTIVE for inactive code', async () => {
    await expect(pricingService.validatePromo('INACTIVEPROMO')).rejects.toMatchObject({
      code: 'PROMO_INACTIVE',
      statusCode: 400,
    });
  });
});

// ─── R9.AC2: Full Price Calculation ──────────────────────────
describe('calculateFullPricing', () => {
  it('R9.AC2: returns full breakdown for mixed package (new user, 10% first_plan)', async () => {
    const result = await pricingService.calculateFullPricing(mixedPackageId, testUserId);

    expect(result.packageId).toBe(mixedPackageId);
    expect(result.basePriceInclVat).toBeGreaterThan(0);
    expect(result.priceExVat).toBeGreaterThan(0);
    expect(result.applicableDiscountType).toBe('first_plan');
    expect(result.discountPercent).toBe(10);
    expect(result.discountAmount).toBeGreaterThan(0);
    expect(result.subtotalAfterDiscount).toBeGreaterThan(0);
    expect(result.vatOnDiscounted).toBeGreaterThan(0);
    expect(result.totalInclVat).toBeGreaterThan(0);
    // Total should be less than base due to discount
    expect(result.totalInclVat).toBeLessThan(result.basePriceInclVat);
  });

  it('R9.AC2: returns all required fields', async () => {
    const result = await pricingService.calculateFullPricing(mixedPackageId, testUserId);

    expect(result).toHaveProperty('packageId');
    expect(result).toHaveProperty('basePriceInclVat');
    expect(result).toHaveProperty('priceExVat');
    expect(result).toHaveProperty('applicableDiscountType');
    expect(result).toHaveProperty('discountPercent');
    expect(result).toHaveProperty('discountAmount');
    expect(result).toHaveProperty('subtotalAfterDiscount');
    expect(result).toHaveProperty('vatOnDiscounted');
    expect(result).toHaveProperty('totalInclVat');
  });

  it('R9.AC4: snack package gets NO discount', async () => {
    const result = await pricingService.calculateFullPricing(snackPackageId, testUserId);

    expect(result.applicableDiscountType).toBe('none');
    expect(result.discountPercent).toBe(0);
    expect(result.discountAmount).toBe(0);
    expect(result.totalInclVat).toBe(result.basePriceInclVat);
  });

  it('R9.AC3: promo code overrides first_plan', async () => {
    const result = await pricingService.calculateFullPricing(mixedPackageId, testUserId, 'TESTPROMO15');

    expect(result.applicableDiscountType).toBe('promo_code');
    expect(result.discountPercent).toBe(15);
    expect(result.discountRuleId).toBe(promoRuleId);
  });

  it('R9.AC2: renewal discount for user with past subscription', async () => {
    const branchRows = await sql`SELECT id FROM branches WHERE is_active = true LIMIT 1`;
    const branchId = branchRows[0]!['id'] as string;

    await sql`
      INSERT INTO subscriptions (user_id, package_id, branch_id, status, start_date, end_date, total_days, pause_days_limit, amount_paid)
      VALUES (${testUserId}::uuid, ${mixedPackageId}::uuid, ${branchId}::uuid, 'expired', '2026-01-01', '2026-01-12', 12, 3, '288.00')
    `;

    const result = await pricingService.calculateFullPricing(mixedPackageId, testUserId);

    expect(result.applicableDiscountType).toBe('renewal');
    expect(result.discountPercent).toBe(5);

    await sql`DELETE FROM subscriptions WHERE user_id = ${testUserId}::uuid`;
  });

  it('should throw PACKAGE_NOT_FOUND for invalid package ID', async () => {
    await expect(
      pricingService.calculateFullPricing('00000000-0000-0000-0000-000000000000', testUserId)
    ).rejects.toMatchObject({
      code: 'PACKAGE_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('R9.AC8: promo errors propagate from calculateFullPricing', async () => {
    await expect(
      pricingService.calculateFullPricing(mixedPackageId, testUserId, 'NONEXISTENT')
    ).rejects.toMatchObject({
      code: 'PROMO_NOT_FOUND',
    });
  });
});

// ─── HTTP Route Tests ────────────────────────────────────────
describe('POST /api/v1/pricing/calculate', () => {
  it('R9.AC2: returns full pricing breakdown', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/calculate')
      .set('Authorization', `Bearer ${token}`)
      .send({ packageId: mixedPackageId });

    expect(res.status).toBe(200);
    expect(res.body.packageId).toBe(mixedPackageId);
    expect(res.body.basePriceInclVat).toBeGreaterThan(0);
    expect(res.body.applicableDiscountType).toBe('first_plan');
    expect(res.body.discountPercent).toBe(10);
    expect(res.body).toHaveProperty('priceExVat');
    expect(res.body).toHaveProperty('discountAmount');
    expect(res.body).toHaveProperty('subtotalAfterDiscount');
    expect(res.body).toHaveProperty('vatOnDiscounted');
    expect(res.body).toHaveProperty('totalInclVat');
  });

  it('R9.AC2: accepts optional promoCode', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/calculate')
      .set('Authorization', `Bearer ${token}`)
      .send({ packageId: mixedPackageId, promoCode: 'TESTPROMO15' });

    expect(res.status).toBe(200);
    expect(res.body.applicableDiscountType).toBe('promo_code');
    expect(res.body.discountPercent).toBe(15);
  });

  it('should require packageId', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/calculate')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('should require authentication', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/calculate')
      .send({ packageId: mixedPackageId });

    expect(res.status).toBe(401);
  });

  it('R9.AC8: returns specific error for bad promo', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/calculate')
      .set('Authorization', `Bearer ${token}`)
      .send({ packageId: mixedPackageId, promoCode: 'EXPIREDPROMO' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PROMO_EXPIRED');
  });
});

describe('POST /api/v1/pricing/validate-promo', () => {
  it('R9.AC7: valid promo returns discount info', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/validate-promo')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'TESTPROMO15' });

    expect(res.status).toBe(200);
    expect(res.body.discountPercent).toBe(15);
    expect(res.body.type).toBe('promo_code');
    expect(res.body.ruleId).toBe(promoRuleId);
  });

  it('R9.AC8: PROMO_NOT_FOUND via HTTP', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/validate-promo')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'NONEXISTENT' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PROMO_NOT_FOUND');
  });

  it('R9.AC8: PROMO_EXPIRED via HTTP', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/validate-promo')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'EXPIREDPROMO' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PROMO_EXPIRED');
  });

  it('R9.AC8: PROMO_LIMIT_REACHED via HTTP', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/validate-promo')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'USEDUP' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PROMO_LIMIT_REACHED');
  });

  it('R9.AC8: PROMO_INACTIVE via HTTP', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/validate-promo')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'INACTIVEPROMO' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PROMO_INACTIVE');
  });

  it('should require code field', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/validate-promo')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('should require authentication', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/validate-promo')
      .send({ code: 'TESTPROMO15' });

    expect(res.status).toBe(401);
  });
});
