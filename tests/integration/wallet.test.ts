/// <reference types="jest" />

import request from 'supertest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../../src/db/schema.js';
import { createApp } from '../../src/app.js';
import { signAccessToken } from '../../src/utils/jwt.js';
import { WalletService } from '../../src/services/wallet.service.js';

const DATABASE_URL = process.env['DATABASE_URL'] ?? 'postgresql://flod:flod_dev_password@localhost:5433/flod_dev';
const JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long!!';
const JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-chars!!';

const TEST_PHONE = '+966500000066';

let sqlClient: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle<typeof schema>>;
let app: ReturnType<typeof createApp>;
let walletService: WalletService;
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
  walletService = new WalletService(db);

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

  // Create a subscription for wallet testing
  const subRes = await request(app).post('/api/v1/subscriptions').set('Authorization', `Bearer ${token}`).send({
    packageId: mixedPackageId,
    branchId: stage0BranchId,
    fulfilmentMode: 'pickup',
    startDate: '2026-06-01',
    paymentId: 'PAY_WALLET_001',
  });
  subscriptionId = subRes.body.id;
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

// ─── R12.AC4: GET /api/v1/subscriptions/:id/wallet ──────────
describe('GET /api/v1/subscriptions/:id/wallet', () => {
  it('R12.AC4: returns wallet balance and transactions', async () => {
    const res = await request(app)
      .get(`/api/v1/subscriptions/${subscriptionId}/wallet`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('walletBalance');
    expect(res.body).toHaveProperty('transactions');
    expect(res.body).toHaveProperty('pagination');
    expect(Array.isArray(res.body.transactions)).toBe(true);
    // Should have the initial_credit transaction
    expect(res.body.transactions.length).toBeGreaterThanOrEqual(1);
  });

  it('R12.AC4: initial transaction is initial_credit', async () => {
    const res = await request(app)
      .get(`/api/v1/subscriptions/${subscriptionId}/wallet`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const initialTxn = res.body.transactions.find((t: { type: string }) => t.type === 'initial_credit');
    expect(initialTxn).toBeDefined();
    expect(parseFloat(initialTxn.amount)).toBeGreaterThan(0);
  });

  it('R12.AC4: supports pagination params', async () => {
    const res = await request(app)
      .get(`/api/v1/subscriptions/${subscriptionId}/wallet?page=1&limit=5`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(5);
    expect(typeof res.body.pagination.total).toBe('number');
  });

  it('returns 404 for nonexistent subscription', async () => {
    const res = await request(app)
      .get('/api/v1/subscriptions/00000000-0000-0000-0000-000000000000/wallet')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('should require authentication', async () => {
    const res = await request(app).get(`/api/v1/subscriptions/${subscriptionId}/wallet`);

    expect(res.status).toBe(401);
  });
});

// ─── R12.AC1: Wallet transact (service-level deduction) ──────
describe('WalletService.transact', () => {
  it('deducts from wallet with FOR UPDATE locking', async () => {
    const beforeRows = await sqlClient`SELECT wallet_balance FROM subscriptions WHERE id = ${subscriptionId}::uuid`;
    const balanceBefore = parseFloat(beforeRows[0]!['wallet_balance'] as string);

    await db.transaction(async (tx) => {
      await walletService.transact(tx, {
        subscriptionId,
        type: 'meal_deduction',
        amount: -24, // deduct SAR 24
        description: 'Test meal deduction',
      });
    });

    const afterRows = await sqlClient`SELECT wallet_balance FROM subscriptions WHERE id = ${subscriptionId}::uuid`;
    const balanceAfter = parseFloat(afterRows[0]!['wallet_balance'] as string);

    expect(balanceAfter).toBe(Math.round((balanceBefore - 24) * 100) / 100);
  });

  it('creates a wallet transaction record', async () => {
    const txnRows = await sqlClient`
      SELECT type, amount, description FROM wallet_transactions
      WHERE subscription_id = ${subscriptionId}::uuid AND type = 'meal_deduction'
      ORDER BY created_at DESC LIMIT 1
    `;

    expect(txnRows.length).toBe(1);
    expect(txnRows[0]!['type']).toBe('meal_deduction');
    expect(parseFloat(txnRows[0]!['amount'] as string)).toBe(-24);
  });

  it('rejects deduction that would go negative (INSUFFICIENT_BALANCE)', async () => {
    // Get current balance
    const rows = await sqlClient`SELECT wallet_balance FROM subscriptions WHERE id = ${subscriptionId}::uuid`;
    const currentBalance = parseFloat(rows[0]!['wallet_balance'] as string);

    await expect(
      db.transaction(async (tx) => {
        await walletService.transact(tx, {
          subscriptionId,
          type: 'meal_deduction',
          amount: -(currentBalance + 1), // exceed balance
          description: 'Should fail',
        });
      }),
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
      statusCode: 400,
    });
  });

  it('credits (positive amount) to wallet', async () => {
    const beforeRows = await sqlClient`SELECT wallet_balance FROM subscriptions WHERE id = ${subscriptionId}::uuid`;
    const balanceBefore = parseFloat(beforeRows[0]!['wallet_balance'] as string);

    await db.transaction(async (tx) => {
      await walletService.transact(tx, {
        subscriptionId,
        type: 'compensation',
        amount: 10,
        description: 'Test compensation',
      });
    });

    const afterRows = await sqlClient`SELECT wallet_balance FROM subscriptions WHERE id = ${subscriptionId}::uuid`;
    const balanceAfter = parseFloat(afterRows[0]!['wallet_balance'] as string);

    expect(balanceAfter).toBe(Math.round((balanceBefore + 10) * 100) / 100);
  });
});
