/// <reference types="jest" />

import request from 'supertest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../../src/db/schema.js';
import { createApp } from '../../src/app.js';
import { signAccessToken } from '../../src/utils/jwt.js';

const DATABASE_URL = process.env['DATABASE_URL'] ?? 'postgresql://flod:flod_dev_password@localhost:5433/flod_dev';
const JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long!!';
const JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-chars!!';

const TEST_PHONE = '+966500000077';

let sqlClient: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle<typeof schema>>;
let app: ReturnType<typeof createApp>;
let testUserId: string;
let token: string;
let stage0BranchId: string;
let nonStage0BranchId: string;
let mixedPackageId: string;
let snackPackageId: string;
let promoRuleId: string;

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

  // Get Stage 0 branch
  const s0Rows = await sqlClient`
    SELECT id FROM branches WHERE is_active = true AND is_stage0 = true LIMIT 1
  `;
  stage0BranchId = s0Rows[0]!['id'] as string;

  // Get a non-Stage-0 branch (or create one if all are stage0)
  const nonS0Rows = await sqlClient`
    SELECT id FROM branches WHERE is_active = true AND is_stage0 = false LIMIT 1
  `;
  if (nonS0Rows.length > 0) {
    nonStage0BranchId = nonS0Rows[0]!['id'] as string;
  } else {
    // All branches are stage0 in seed data — create a test non-stage0 branch
    const newBranch = await sqlClient`
      INSERT INTO branches (foodics_ref, name_en, name_ar, type, is_active, is_stage0)
      VALUES ('test-non-s0', 'Test Non-Stage0', 'فرع تجريبي', 'main', true, false)
      RETURNING id
    `;
    nonStage0BranchId = newBranch[0]!['id'] as string;
  }

  // Get a mixed package (has meal distribution) and a snack package
  const mixedRows = await sqlClient`
    SELECT id FROM packages WHERE category = 'mixed' AND is_active = true LIMIT 1
  `;
  mixedPackageId = mixedRows[0]!['id'] as string;

  const snackRows = await sqlClient`
    SELECT id FROM packages WHERE category = 'snack' AND is_active = true LIMIT 1
  `;
  snackPackageId = snackRows[0]!['id'] as string;

  // Create a test promo code
  const promoRows = await sqlClient`
    INSERT INTO discount_rules (type, code, discount_percent, applies_to, max_uses, current_uses, valid_from, valid_to, is_active)
    VALUES ('promo_code', 'SUBTEST20', '20.00', ARRAY['main_meals'], 100, 0, NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days', true)
    RETURNING id
  `;
  promoRuleId = promoRows[0]!['id'] as string;
});

afterAll(async () => {
  // Clean up in dependency order
  await sqlClient`DELETE FROM wallet_transactions WHERE subscription_id IN (SELECT id FROM subscriptions WHERE user_id = ${testUserId}::uuid)`;
  await sqlClient`DELETE FROM subscription_daily_meals WHERE subscription_id IN (SELECT id FROM subscriptions WHERE user_id = ${testUserId}::uuid)`;
  await sqlClient`DELETE FROM subscriptions WHERE user_id = ${testUserId}::uuid`;
  await sqlClient`DELETE FROM discount_rules WHERE code = 'SUBTEST20'`;
  await sqlClient`DELETE FROM branches WHERE foodics_ref = 'test-non-s0'`;
  await sqlClient`DELETE FROM users WHERE phone = ${TEST_PHONE}`;
  await sqlClient.end();
  delete process.env['JWT_SECRET'];
  delete process.env['JWT_REFRESH_SECRET'];
});

// Helper to clean up subscriptions between tests
async function cleanupSubscriptions() {
  await sqlClient`DELETE FROM wallet_transactions WHERE subscription_id IN (SELECT id FROM subscriptions WHERE user_id = ${testUserId}::uuid)`;
  await sqlClient`DELETE FROM subscription_daily_meals WHERE subscription_id IN (SELECT id FROM subscriptions WHERE user_id = ${testUserId}::uuid)`;
  await sqlClient`DELETE FROM subscriptions WHERE user_id = ${testUserId}::uuid`;
}

// ─── R10.AC1: Subscription Creation ──────────────────────────
describe('POST /api/v1/subscriptions', () => {
  afterEach(async () => {
    await cleanupSubscriptions();
  });

  it('R10.AC1: creates subscription with status active and correct fields', async () => {
    const res = await request(app).post('/api/v1/subscriptions').set('Authorization', `Bearer ${token}`).send({
      packageId: mixedPackageId,
      branchId: stage0BranchId,
      fulfilmentMode: 'pickup',
      startDate: '2026-06-01',
      paymentId: 'PAY_TEST_001',
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('active');
    expect(res.body.userId).toBe(testUserId);
    expect(res.body.packageId).toBe(mixedPackageId);
    expect(res.body.branchId).toBe(stage0BranchId);
    expect(res.body.fulfilment).toBe('pickup');
    expect(res.body.startDate).toBe('2026-06-01');
    expect(res.body.currentDay).toBe(1);
    expect(res.body.pauseDaysUsed).toBe(0);
    expect(res.body.paymentId).toBe('PAY_TEST_001');
  });

  it('R10.AC1: pause_days_limit based on duration (12→3, 18→6, 24→10)', async () => {
    const res = await request(app).post('/api/v1/subscriptions').set('Authorization', `Bearer ${token}`).send({
      packageId: mixedPackageId,
      branchId: stage0BranchId,
      fulfilmentMode: 'pickup',
      startDate: '2026-06-01',
      paymentId: 'PAY_TEST_002',
    });

    expect(res.status).toBe(201);
    // The pause_days_limit should match the package duration
    const limits: Record<number, number> = { 12: 3, 18: 6, 24: 10 };
    const expectedLimit = limits[res.body.totalDays as number] ?? 0;
    expect(res.body.pauseDaysLimit).toBe(expectedLimit);
  });

  it('R10.AC1: wallet_balance equals amount paid', async () => {
    const res = await request(app).post('/api/v1/subscriptions').set('Authorization', `Bearer ${token}`).send({
      packageId: mixedPackageId,
      branchId: stage0BranchId,
      fulfilmentMode: 'pickup',
      startDate: '2026-06-01',
      paymentId: 'PAY_TEST_003',
    });

    expect(res.status).toBe(201);
    expect(res.body.walletBalance).toBe(res.body.amountPaid);
  });

  it('R10.AC2: generates daily meal schedule', async () => {
    const res = await request(app).post('/api/v1/subscriptions').set('Authorization', `Bearer ${token}`).send({
      packageId: mixedPackageId,
      branchId: stage0BranchId,
      fulfilmentMode: 'pickup',
      startDate: '2026-06-01',
      paymentId: 'PAY_TEST_004',
    });

    expect(res.status).toBe(201);
    expect(res.body.mealsGenerated).toBeGreaterThan(0);

    // Verify meals exist in DB
    const meals = await sqlClient`
      SELECT count(*)::int as count FROM subscription_daily_meals
      WHERE subscription_id = ${res.body.id}::uuid
    `;
    expect(meals[0]!['count']).toBe(res.body.mealsGenerated);
  });

  it('R10.AC3: creates initial_credit wallet transaction', async () => {
    const res = await request(app).post('/api/v1/subscriptions').set('Authorization', `Bearer ${token}`).send({
      packageId: mixedPackageId,
      branchId: stage0BranchId,
      fulfilmentMode: 'pickup',
      startDate: '2026-06-01',
      paymentId: 'PAY_TEST_005',
    });

    expect(res.status).toBe(201);

    const txns = await sqlClient`
      SELECT type, amount, balance_after FROM wallet_transactions
      WHERE subscription_id = ${res.body.id}::uuid
    `;
    expect(txns.length).toBe(1);
    expect(txns[0]!['type']).toBe('initial_credit');
    expect(txns[0]!['amount']).toBe(res.body.amountPaid);
    expect(txns[0]!['balance_after']).toBe(res.body.walletBalance);
  });

  it('R10.AC4: promo code applies discount and increments current_uses', async () => {
    // Get current_uses before
    const beforeRows = await sqlClient`SELECT current_uses FROM discount_rules WHERE code = 'SUBTEST20'`;
    const usesBefore = beforeRows[0]!['current_uses'] as number;

    const res = await request(app).post('/api/v1/subscriptions').set('Authorization', `Bearer ${token}`).send({
      packageId: mixedPackageId,
      branchId: stage0BranchId,
      fulfilmentMode: 'pickup',
      startDate: '2026-06-01',
      paymentId: 'PAY_TEST_006',
      promoCode: 'SUBTEST20',
    });

    expect(res.status).toBe(201);
    expect(res.body.pricing.applicableDiscountType).toBe('promo_code');
    expect(res.body.pricing.discountPercent).toBe(20);

    // Verify current_uses incremented
    const afterRows = await sqlClient`SELECT current_uses FROM discount_rules WHERE code = 'SUBTEST20'`;
    expect(afterRows[0]!['current_uses']).toBe(usesBefore + 1);
  });

  it('R10.AC5: rejects non-Stage-0 branch', async () => {
    const res = await request(app).post('/api/v1/subscriptions').set('Authorization', `Bearer ${token}`).send({
      packageId: mixedPackageId,
      branchId: nonStage0BranchId,
      fulfilmentMode: 'pickup',
      startDate: '2026-06-01',
      paymentId: 'PAY_TEST_007',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_BRANCH');
  });

  it('R10.AC5: rejects nonexistent branch', async () => {
    const res = await request(app).post('/api/v1/subscriptions').set('Authorization', `Bearer ${token}`).send({
      packageId: mixedPackageId,
      branchId: '00000000-0000-0000-0000-000000000000',
      fulfilmentMode: 'pickup',
      startDate: '2026-06-01',
      paymentId: 'PAY_TEST_008',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_BRANCH');
  });

  it('R10.AC6: rejects duplicate active subscription at same branch', async () => {
    // Create first subscription
    const res1 = await request(app).post('/api/v1/subscriptions').set('Authorization', `Bearer ${token}`).send({
      packageId: mixedPackageId,
      branchId: stage0BranchId,
      fulfilmentMode: 'pickup',
      startDate: '2026-06-01',
      paymentId: 'PAY_TEST_009A',
    });
    expect(res1.status).toBe(201);

    // Try second subscription at same branch
    const res2 = await request(app).post('/api/v1/subscriptions').set('Authorization', `Bearer ${token}`).send({
      packageId: mixedPackageId,
      branchId: stage0BranchId,
      fulfilmentMode: 'pickup',
      startDate: '2026-06-15',
      paymentId: 'PAY_TEST_009B',
    });

    expect(res2.status).toBe(409);
    expect(res2.body.code).toBe('SUBSCRIPTION_CONFLICT');
  });

  it('should reject missing required fields', async () => {
    const res = await request(app).post('/api/v1/subscriptions').set('Authorization', `Bearer ${token}`).send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('should reject invalid fulfilmentMode', async () => {
    const res = await request(app).post('/api/v1/subscriptions').set('Authorization', `Bearer ${token}`).send({
      packageId: mixedPackageId,
      branchId: stage0BranchId,
      fulfilmentMode: 'drone',
      startDate: '2026-06-01',
      paymentId: 'PAY_TEST_010',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('should require authentication', async () => {
    const res = await request(app).post('/api/v1/subscriptions').send({
      packageId: mixedPackageId,
      branchId: stage0BranchId,
      fulfilmentMode: 'pickup',
      startDate: '2026-06-01',
      paymentId: 'PAY_TEST_011',
    });

    expect(res.status).toBe(401);
  });

  it('R10.AC1: first-plan discount applied for new user', async () => {
    const res = await request(app).post('/api/v1/subscriptions').set('Authorization', `Bearer ${token}`).send({
      packageId: mixedPackageId,
      branchId: stage0BranchId,
      fulfilmentMode: 'pickup',
      startDate: '2026-06-01',
      paymentId: 'PAY_TEST_012',
    });

    expect(res.status).toBe(201);
    expect(res.body.pricing.applicableDiscountType).toBe('first_plan');
    expect(res.body.pricing.discountPercent).toBe(10);
  });
});

// ─── Helper: create a subscription and return its ID ─────────
async function createTestSubscription(paymentId: string): Promise<string> {
  const res = await request(app).post('/api/v1/subscriptions').set('Authorization', `Bearer ${token}`).send({
    packageId: mixedPackageId,
    branchId: stage0BranchId,
    fulfilmentMode: 'pickup',
    startDate: '2026-06-01',
    paymentId,
  });
  return res.body.id as string;
}

// ─── R11.AC1: Get Active Subscription ────────────────────────
describe('GET /api/v1/subscriptions/active', () => {
  afterEach(async () => {
    await cleanupSubscriptions();
  });

  it('R11.AC1: returns active subscription with details', async () => {
    await createTestSubscription('PAY_ACTIVE_001');

    const res = await request(app).get('/api/v1/subscriptions/active').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toMatch(/active|paused/);
    expect(res.body).toHaveProperty('packageNameEn');
    expect(res.body).toHaveProperty('branchNameEn');
    expect(res.body).toHaveProperty('walletBalance');
    expect(res.body).toHaveProperty('daysRemaining');
    expect(res.body).toHaveProperty('currentDay');
    expect(res.body.daysRemaining).toBeGreaterThan(0);
  });

  it('R11.AC1: returns 404 when no active subscription', async () => {
    const res = await request(app).get('/api/v1/subscriptions/active').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('SUBSCRIPTION_NOT_FOUND');
  });

  it('should require authentication', async () => {
    const res = await request(app).get('/api/v1/subscriptions/active');
    expect(res.status).toBe(401);
  });
});

// ─── R11.AC2 + R11.AC3 + R11.AC5: Pause ─────────────────────
describe('POST /api/v1/subscriptions/:id/pause', () => {
  let subId: string;

  beforeEach(async () => {
    subId = await createTestSubscription('PAY_PAUSE_001');
  });

  afterEach(async () => {
    await cleanupSubscriptions();
  });

  it('R11.AC2: pauses subscription with valid request', async () => {
    const res = await request(app)
      .post(`/api/v1/subscriptions/${subId}/pause`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        pauseStart: '2026-06-10', // far enough in future
        pauseEnd: '2026-06-11',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('paused');
    expect(res.body.businessDaysPaused).toBeGreaterThan(0);
  });

  it('R11.AC5: extends end_date by calendar days', async () => {
    // Get original end_date
    const beforeRows = await sqlClient`SELECT end_date FROM subscriptions WHERE id = ${subId}::uuid`;
    const originalEndDate = beforeRows[0]!['end_date'] as string;

    const res = await request(app)
      .post(`/api/v1/subscriptions/${subId}/pause`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        pauseStart: '2026-06-10',
        pauseEnd: '2026-06-12', // 3 calendar days
      });

    expect(res.status).toBe(200);
    expect(res.body.extensionDays).toBe(3);

    // Verify end_date was extended
    const afterRows = await sqlClient`SELECT end_date FROM subscriptions WHERE id = ${subId}::uuid`;
    const newEndDate = new Date(afterRows[0]!['end_date'] as string);
    const origDate = new Date(originalEndDate);
    const diff = Math.round((newEndDate.getTime() - origDate.getTime()) / (1000 * 60 * 60 * 24));
    expect(diff).toBe(3);
  });

  it('R11.AC3: rejects pause on already-paused subscription', async () => {
    // First pause
    await request(app)
      .post(`/api/v1/subscriptions/${subId}/pause`)
      .set('Authorization', `Bearer ${token}`)
      .send({ pauseStart: '2026-06-10', pauseEnd: '2026-06-10' });

    // Second pause attempt
    const res = await request(app)
      .post(`/api/v1/subscriptions/${subId}/pause`)
      .set('Authorization', `Bearer ${token}`)
      .send({ pauseStart: '2026-06-15', pauseEnd: '2026-06-15' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PAUSE_NOT_ACTIVE');
  });

  it('R11.AC3: rejects insufficient notice (today)', async () => {
    const today = new Date().toISOString().split('T')[0]!;

    const res = await request(app)
      .post(`/api/v1/subscriptions/${subId}/pause`)
      .set('Authorization', `Bearer ${token}`)
      .send({ pauseStart: today, pauseEnd: today });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PAUSE_INSUFFICIENT_NOTICE');
  });

  it('should require authentication', async () => {
    const res = await request(app)
      .post(`/api/v1/subscriptions/${subId}/pause`)
      .send({ pauseStart: '2026-06-10', pauseEnd: '2026-06-11' });

    expect(res.status).toBe(401);
  });

  it('should require pauseStart and pauseEnd', async () => {
    const res = await request(app)
      .post(`/api/v1/subscriptions/${subId}/pause`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

// ─── R11.AC4: Resume ─────────────────────────────────────────
describe('POST /api/v1/subscriptions/:id/resume', () => {
  let subId: string;

  beforeEach(async () => {
    subId = await createTestSubscription('PAY_RESUME_001');
    // Pause it first
    await request(app)
      .post(`/api/v1/subscriptions/${subId}/pause`)
      .set('Authorization', `Bearer ${token}`)
      .send({ pauseStart: '2026-06-10', pauseEnd: '2026-06-10' });
  });

  afterEach(async () => {
    await cleanupSubscriptions();
  });

  it('R11.AC4: resumes a paused subscription', async () => {
    const res = await request(app)
      .post(`/api/v1/subscriptions/${subId}/resume`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
  });

  it('rejects resume on already active subscription', async () => {
    // Resume first
    await request(app).post(`/api/v1/subscriptions/${subId}/resume`).set('Authorization', `Bearer ${token}`);

    // Try resume again
    const res = await request(app)
      .post(`/api/v1/subscriptions/${subId}/resume`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NOT_PAUSED');
  });

  it('should require authentication', async () => {
    const res = await request(app).post(`/api/v1/subscriptions/${subId}/resume`);

    expect(res.status).toBe(401);
  });
});

// ─── R11.AC6: Schedule ───────────────────────────────────────
describe('GET /api/v1/subscriptions/:id/schedule', () => {
  let subId: string;

  beforeAll(async () => {
    subId = await createTestSubscription('PAY_SCHEDULE_001');
  });

  afterAll(async () => {
    await cleanupSubscriptions();
  });

  it('R11.AC6: returns daily meal schedule with collection status', async () => {
    const res = await request(app)
      .get(`/api/v1/subscriptions/${subId}/schedule`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.subscriptionId).toBe(subId);
    expect(Array.isArray(res.body.schedule)).toBe(true);
    expect(res.body.schedule.length).toBeGreaterThan(0);

    const meal = res.body.schedule[0];
    expect(meal).toHaveProperty('dayNumber');
    expect(meal).toHaveProperty('mealSlot');
    expect(meal).toHaveProperty('productId');
    expect(meal).toHaveProperty('priceInclVat');
    expect(meal).toHaveProperty('isCollected');
    expect(meal).toHaveProperty('productNameEn');
  });

  it('returns 404 for nonexistent subscription', async () => {
    const res = await request(app)
      .get('/api/v1/subscriptions/00000000-0000-0000-0000-000000000000/schedule')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('should require authentication', async () => {
    const res = await request(app).get(`/api/v1/subscriptions/${subId}/schedule`);

    expect(res.status).toBe(401);
  });
});

// ─── R11.AC7: History ────────────────────────────────────────
describe('GET /api/v1/subscriptions/history', () => {
  beforeAll(async () => {
    await createTestSubscription('PAY_HIST_001');
  });

  afterAll(async () => {
    await cleanupSubscriptions();
  });

  it('R11.AC7: returns subscription history ordered by created_at desc', async () => {
    const res = await request(app).get('/api/v1/subscriptions/history').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);

    const sub = res.body[0];
    expect(sub).toHaveProperty('id');
    expect(sub).toHaveProperty('status');
    expect(sub).toHaveProperty('startDate');
    expect(sub).toHaveProperty('amountPaid');
    expect(sub).toHaveProperty('packageNameEn');
    expect(sub).toHaveProperty('branchNameEn');
  });

  it('returns empty array for user with no subscriptions', async () => {
    // Create a different user
    const otherUserRows = await sqlClient`
      INSERT INTO users (phone) VALUES ('+966500000076')
      ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
      RETURNING id
    `;
    const otherUserId = otherUserRows[0]!['id'] as string;
    const otherToken = signAccessToken({ userId: otherUserId, phone: '+966500000076' });

    const res = await request(app).get('/api/v1/subscriptions/history').set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);

    await sqlClient`DELETE FROM users WHERE phone = '+966500000076'`;
  });

  it('should require authentication', async () => {
    const res = await request(app).get('/api/v1/subscriptions/history');
    expect(res.status).toBe(401);
  });
});
