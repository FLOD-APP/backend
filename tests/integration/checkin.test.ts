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

const TEST_PHONE = '+966500000044';

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

  // Get branch and package
  const branchRows = await sqlClient`SELECT id FROM branches WHERE is_active = true AND is_stage0 = true LIMIT 1`;
  stage0BranchId = branchRows[0]!['id'] as string;

  const pkgRows = await sqlClient`SELECT id FROM packages WHERE category = 'mixed' AND is_active = true LIMIT 1`;
  mixedPackageId = pkgRows[0]!['id'] as string;

  // Create a subscription
  const subRes = await request(app)
    .post('/api/v1/subscriptions')
    .set('Authorization', `Bearer ${token}`)
    .send({
      packageId: mixedPackageId,
      branchId: stage0BranchId,
      fulfilmentMode: 'pickup',
      startDate: '2026-06-01',
      paymentId: 'PAY_CHECKIN_001',
    });
  subscriptionId = subRes.body.id;
});

afterAll(async () => {
  await sqlClient`DELETE FROM check_ins WHERE user_id = ${testUserId}::uuid`;
  await sqlClient`DELETE FROM wallet_transactions WHERE subscription_id IN (SELECT id FROM subscriptions WHERE user_id = ${testUserId}::uuid)`;
  await sqlClient`DELETE FROM subscription_daily_meals WHERE subscription_id IN (SELECT id FROM subscriptions WHERE user_id = ${testUserId}::uuid)`;
  await sqlClient`DELETE FROM subscriptions WHERE user_id = ${testUserId}::uuid`;
  await sqlClient`DELETE FROM users WHERE phone = ${TEST_PHONE}`;
  await sqlClient.end();
  delete process.env['JWT_SECRET'];
  delete process.env['JWT_REFRESH_SECRET'];
});

// ─── R17.AC1: Check-In ──────────────────────────────────────
describe('POST /api/v1/subscriptions/:id/check-in', () => {
  afterEach(async () => {
    await sqlClient`DELETE FROM check_ins WHERE user_id = ${testUserId}::uuid`;
  });

  it('R17.AC1: creates check-in with status "waiting"', async () => {
    const res = await request(app)
      .post(`/api/v1/subscriptions/${subscriptionId}/check-in`)
      .set('Authorization', `Bearer ${token}`)
      .send({ branchId: stage0BranchId });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('waiting');
    expect(res.body.subscriptionId).toBe(subscriptionId);
    expect(res.body.branchId).toBe(stage0BranchId);
    expect(res.body).toHaveProperty('checkedInAt');
  });

  it('R17.AC4: rejects if no active subscription at branch', async () => {
    // Get a different branch
    const otherBranch = await sqlClient`
      SELECT id FROM branches WHERE id != ${stage0BranchId}::uuid AND is_active = true LIMIT 1
    `;

    if (otherBranch.length === 0) return; // skip if only one branch

    const res = await request(app)
      .post(`/api/v1/subscriptions/${subscriptionId}/check-in`)
      .set('Authorization', `Bearer ${token}`)
      .send({ branchId: otherBranch[0]!['id'] });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NO_ACTIVE_SUBSCRIPTION');
  });

  it('should require branchId', async () => {
    const res = await request(app)
      .post(`/api/v1/subscriptions/${subscriptionId}/check-in`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('should require authentication', async () => {
    const res = await request(app)
      .post(`/api/v1/subscriptions/${subscriptionId}/check-in`)
      .send({ branchId: stage0BranchId });

    expect(res.status).toBe(401);
  });
});

// ─── R17.AC2: Branch Queue ───────────────────────────────────
describe('GET /api/v1/branches/:id/queue', () => {
  let checkInId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post(`/api/v1/subscriptions/${subscriptionId}/check-in`)
      .set('Authorization', `Bearer ${token}`)
      .send({ branchId: stage0BranchId });
    checkInId = res.body.id;
  });

  afterAll(async () => {
    await sqlClient`DELETE FROM check_ins WHERE user_id = ${testUserId}::uuid`;
  });

  it('R17.AC2: returns queue ordered by check-in time', async () => {
    const res = await request(app)
      .get(`/api/v1/branches/${stage0BranchId}/queue`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);

    const item = res.body.find((c: { id: string }) => c.id === checkInId);
    expect(item).toBeDefined();
    expect(item.status).toBe('waiting');
    expect(item).toHaveProperty('checkedInAt');
    expect(item).toHaveProperty('userPhone');
  });

  it('should require authentication', async () => {
    const res = await request(app)
      .get(`/api/v1/branches/${stage0BranchId}/queue`);

    expect(res.status).toBe(401);
  });
});

// ─── R17.AC3: Update Check-In Status ────────────────────────
describe('PATCH /api/v1/check-ins/:id', () => {
  let checkInId: string;

  beforeEach(async () => {
    const res = await request(app)
      .post(`/api/v1/subscriptions/${subscriptionId}/check-in`)
      .set('Authorization', `Bearer ${token}`)
      .send({ branchId: stage0BranchId });
    checkInId = res.body.id;
  });

  afterEach(async () => {
    await sqlClient`DELETE FROM check_ins WHERE user_id = ${testUserId}::uuid`;
  });

  it('R17.AC3: updates status to "preparing"', async () => {
    const res = await request(app)
      .patch(`/api/v1/check-ins/${checkInId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'preparing' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('preparing');
    expect(res.body).toHaveProperty('statusUpdatedAt');
  });

  it('R17.AC3: updates status to "ready"', async () => {
    const res = await request(app)
      .patch(`/api/v1/check-ins/${checkInId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ready' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  it('R17.AC3: updates status to "collected"', async () => {
    const res = await request(app)
      .patch(`/api/v1/check-ins/${checkInId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'collected' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('collected');
  });

  it('rejects invalid status', async () => {
    const res = await request(app)
      .patch(`/api/v1/check-ins/${checkInId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'invalid' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for nonexistent check-in', async () => {
    const res = await request(app)
      .patch('/api/v1/check-ins/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'preparing' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('CHECKIN_NOT_FOUND');
  });

  it('should require authentication', async () => {
    const res = await request(app)
      .patch(`/api/v1/check-ins/${checkInId}`)
      .send({ status: 'preparing' });

    expect(res.status).toBe(401);
  });
});
