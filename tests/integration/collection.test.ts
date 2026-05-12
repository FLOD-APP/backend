import request from 'supertest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../../src/db/schema.js';
import { createApp } from '../../src/app.js';
import { signAccessToken } from '../../src/utils/jwt.js';

const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://flod:flod_dev_password@localhost:5433/flod_dev';
const JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long!!';
const JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-chars!!';

const TEST_PHONE = '+966500000055';

let sqlClient: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle<typeof schema>>;
let app: ReturnType<typeof createApp>;
let testUserId: string;
let token: string;
let subscriptionId: string;
let stage0BranchId: string;
let mixedPackageId: string;

beforeAll(async () => {
  process.env['JWT_SECRET'] = JWT_SECRET;
  process.env['JWT_REFRESH_SECRET'] = JWT_REFRESH_SECRET;

  sqlClient = postgres(DATABASE_URL, { max: 2 });
  db = drizzle(sqlClient, { schema });

  app = createApp({
    checkDb: async () => true,
    version: '0.1.0-test',
    db,
  });

  // Create test user
  const userRows = await sqlClient`
    INSERT INTO users (phone) VALUES (${TEST_PHONE})
    ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
    RETURNING id
  `;
  testUserId = userRows[0]!['id'] as string;
  token = signAccessToken({ userId: testUserId, phone: TEST_PHONE });

  // Get stage 0 branch and mixed package
  const branchRows = await sqlClient`SELECT id FROM branches WHERE is_active = true AND is_stage0 = true LIMIT 1`;
  stage0BranchId = branchRows[0]!['id'] as string;

  const pkgRows = await sqlClient`SELECT id FROM packages WHERE category = 'mixed' AND is_active = true LIMIT 1`;
  mixedPackageId = pkgRows[0]!['id'] as string;
});

afterAll(async () => {
  await sqlClient`DELETE FROM wallet_transactions WHERE subscription_id IN (SELECT id FROM subscriptions WHERE user_id = ${testUserId}::uuid)`;
  await sqlClient`DELETE FROM subscription_daily_meals WHERE subscription_id IN (SELECT id FROM subscriptions WHERE user_id = ${testUserId}::uuid)`;
  await sqlClient`DELETE FROM subscriptions WHERE user_id = ${testUserId}::uuid`;
  await sqlClient`DELETE FROM users WHERE phone = ${TEST_PHONE}`;
  await sqlClient.end();
  delete process.env['JWT_SECRET'];
  delete process.env['JWT_REFRESH_SECRET'];
});

async function createSubscription(paymentId: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/subscriptions')
    .set('Authorization', `Bearer ${token}`)
    .send({
      packageId: mixedPackageId,
      branchId: stage0BranchId,
      fulfilmentMode: 'pickup',
      startDate: '2026-06-01',
      paymentId,
    });
  return res.body.id as string;
}

async function cleanupSub() {
  await sqlClient`DELETE FROM wallet_transactions WHERE subscription_id IN (SELECT id FROM subscriptions WHERE user_id = ${testUserId}::uuid)`;
  await sqlClient`DELETE FROM subscription_daily_meals WHERE subscription_id IN (SELECT id FROM subscriptions WHERE user_id = ${testUserId}::uuid)`;
  await sqlClient`DELETE FROM subscriptions WHERE user_id = ${testUserId}::uuid`;
}

// ─── R12.AC1: Collect Meal ───────────────────────────────────
describe('POST /api/v1/subscriptions/:id/collect', () => {
  beforeEach(async () => {
    subscriptionId = await createSubscription('PAY_COLLECT_001');
  });

  afterEach(async () => {
    await cleanupSub();
  });

  it('R12.AC1: collects a meal and deducts from wallet', async () => {
    const res = await request(app)
      .post(`/api/v1/subscriptions/${subscriptionId}/collect`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dayNumber: 1, mealSlot: 1 });

    expect(res.status).toBe(200);
    expect(res.body.dayNumber).toBe(1);
    expect(res.body.mealSlot).toBe(1);
    expect(res.body.priceDeducted).toBeGreaterThan(0);
    expect(res.body).toHaveProperty('walletBalance');
  });

  it('R12.AC1: creates meal_deduction wallet transaction', async () => {
    await request(app)
      .post(`/api/v1/subscriptions/${subscriptionId}/collect`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dayNumber: 1, mealSlot: 1 });

    const txns = await sqlClient`
      SELECT type FROM wallet_transactions
      WHERE subscription_id = ${subscriptionId}::uuid AND type = 'meal_deduction'
    `;
    expect(txns.length).toBeGreaterThanOrEqual(1);
  });

  it('R12.AC2: rejects already-collected meal with 409', async () => {
    // Collect once
    await request(app)
      .post(`/api/v1/subscriptions/${subscriptionId}/collect`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dayNumber: 1, mealSlot: 1 });

    // Try again
    const res = await request(app)
      .post(`/api/v1/subscriptions/${subscriptionId}/collect`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dayNumber: 1, mealSlot: 1 });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('MEAL_ALREADY_COLLECTED');
  });

  it('R12.AC3: missed days auto-consumed when collecting later day', async () => {
    // Skip day 1, collect day 2
    const res = await request(app)
      .post(`/api/v1/subscriptions/${subscriptionId}/collect`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dayNumber: 2, mealSlot: 1 });

    expect(res.status).toBe(200);
    expect(res.body.missedMealsConsumed).toBeGreaterThan(0);

    // Verify day 1 meals were marked as collected
    const day1Meals = await sqlClient`
      SELECT is_collected FROM subscription_daily_meals
      WHERE subscription_id = ${subscriptionId}::uuid AND day_number = 1
    `;
    for (const meal of day1Meals) {
      expect(meal['is_collected']).toBe(true);
    }
  });

  it('returns 404 for nonexistent meal', async () => {
    const res = await request(app)
      .post(`/api/v1/subscriptions/${subscriptionId}/collect`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dayNumber: 999, mealSlot: 1 });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('MEAL_NOT_FOUND');
  });

  it('should require authentication', async () => {
    const res = await request(app)
      .post(`/api/v1/subscriptions/${subscriptionId}/collect`)
      .send({ dayNumber: 1, mealSlot: 1 });

    expect(res.status).toBe(401);
  });

  it('should validate dayNumber and mealSlot', async () => {
    const res = await request(app)
      .post(`/api/v1/subscriptions/${subscriptionId}/collect`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

// ─── R12.AC5 + R12.AC6: Swap Meal ───────────────────────────
describe('POST /api/v1/subscriptions/:id/swap', () => {
  let swapProductId: string;

  beforeAll(async () => {
    // Get a different active product with subscription pricing
    const rows = await sqlClient`
      SELECT p.id FROM products p
      INNER JOIN product_prices pp ON p.id = pp.product_id
      WHERE p.is_active = true AND pp.tier = 'subscription' AND pp.branch_id IS NULL
        AND pp.effective_from <= CURRENT_DATE
        AND (pp.effective_to IS NULL OR pp.effective_to > CURRENT_DATE)
      LIMIT 1
    `;
    swapProductId = rows[0]!['id'] as string;
  });

  beforeEach(async () => {
    subscriptionId = await createSubscription('PAY_SWAP_001');
  });

  afterEach(async () => {
    await cleanupSub();
  });

  it('R12.AC5: swaps meal to different product', async () => {
    const res = await request(app)
      .post(`/api/v1/subscriptions/${subscriptionId}/swap`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dayNumber: 1, mealSlot: 1, newProductId: swapProductId });

    expect(res.status).toBe(200);
    expect(res.body.newProductId).toBe(swapProductId);
    expect(res.body).toHaveProperty('priceDifference');
    expect(res.body).toHaveProperty('previousProductId');
  });

  it('R12.AC5: creates swap_adjustment transaction if price differs', async () => {
    const res = await request(app)
      .post(`/api/v1/subscriptions/${subscriptionId}/swap`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dayNumber: 1, mealSlot: 1, newProductId: swapProductId });

    expect(res.status).toBe(200);

    if (res.body.priceDifference !== 0) {
      const txns = await sqlClient`
        SELECT type FROM wallet_transactions
        WHERE subscription_id = ${subscriptionId}::uuid AND type = 'swap_adjustment'
      `;
      expect(txns.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('rejects swap on already-collected meal', async () => {
    // Collect first
    await request(app)
      .post(`/api/v1/subscriptions/${subscriptionId}/collect`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dayNumber: 1, mealSlot: 1 });

    // Try swap
    const res = await request(app)
      .post(`/api/v1/subscriptions/${subscriptionId}/swap`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dayNumber: 1, mealSlot: 1, newProductId: swapProductId });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MEAL_ALREADY_COLLECTED');
  });

  it('returns 404 for nonexistent new product', async () => {
    const res = await request(app)
      .post(`/api/v1/subscriptions/${subscriptionId}/swap`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        dayNumber: 1,
        mealSlot: 1,
        newProductId: '00000000-0000-0000-0000-000000000000',
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('should require authentication', async () => {
    const res = await request(app)
      .post(`/api/v1/subscriptions/${subscriptionId}/swap`)
      .send({ dayNumber: 1, mealSlot: 1, newProductId: swapProductId });

    expect(res.status).toBe(401);
  });

  it('should validate required fields', async () => {
    const res = await request(app)
      .post(`/api/v1/subscriptions/${subscriptionId}/swap`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
