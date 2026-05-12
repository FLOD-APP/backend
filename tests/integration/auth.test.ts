import request from 'supertest';
import express, { type Request, type Response } from 'express';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import jwt from 'jsonwebtoken';
import * as schema from '../../src/db/schema.js';
import { createApp } from '../../src/app.js';
import { clearRateLimitStore } from '../../src/middleware/rateLimit.middleware.js';
import { requireAuth } from '../../src/middleware/auth.middleware.js';
import { errorHandler } from '../../src/middleware/error.middleware.js';
import { logger as appLogger } from '../../src/middleware/logger.middleware.js';

const DATABASE_URL = process.env['DATABASE_URL'] ?? 'postgresql://flod:flod_dev_password@localhost:5433/flod_dev';
const JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long!!';
const JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-chars!!';
const TEST_PHONE = '+966500000001';
const TEST_PHONE_2 = '+966500000002';

let sql: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle<typeof schema>>;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  process.env['JWT_SECRET'] = JWT_SECRET;
  process.env['JWT_REFRESH_SECRET'] = JWT_REFRESH_SECRET;

  sql = postgres(DATABASE_URL, { max: 2 });
  db = drizzle(sql, { schema });

  app = createApp({
    checkDb: async () => true,
    version: '0.1.0-test',
    db,
  });
});

afterAll(async () => {
  // Clean up test data
  await sql`DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE phone IN (${TEST_PHONE}, ${TEST_PHONE_2}))`;
  await sql`DELETE FROM otp_codes WHERE phone IN (${TEST_PHONE}, ${TEST_PHONE_2})`;
  await sql`DELETE FROM users WHERE phone IN (${TEST_PHONE}, ${TEST_PHONE_2})`;
  await sql.end();
  delete process.env['JWT_SECRET'];
  delete process.env['JWT_REFRESH_SECRET'];
});

beforeEach(() => {
  clearRateLimitStore();
});

// ─── R5.AC1: OTP Request ──────────────────────────────────────────
describe('POST /api/v1/auth/otp/request', () => {
  afterEach(async () => {
    await sql`DELETE FROM otp_codes WHERE phone = ${TEST_PHONE}`;
  });

  it('R5.AC1: should return { sent: true } and store a hashed OTP', async () => {
    const res = await request(app).post('/api/v1/auth/otp/request').send({ phone: TEST_PHONE });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: true });

    // Verify an OTP record was stored in the database
    const otpRows = await sql`
      SELECT code_hash, expires_at, used
      FROM otp_codes
      WHERE phone = ${TEST_PHONE}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    expect(otpRows).toHaveLength(1);
    // Hash should be a bcrypt hash (starts with $2b$ or $2a$)
    expect(otpRows[0]!['code_hash']).toMatch(/^\$2[ab]\$/);
    // Should not be used yet
    expect(otpRows[0]!['used']).toBe(false);
    // Should expire in the future (within ~5 minutes)
    const expiresAt = new Date(otpRows[0]!['expires_at'] as string);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 5 * 60 * 1000 + 1000);
  });

  it('should reject invalid phone format', async () => {
    const res = await request(app).post('/api/v1/auth/otp/request').send({ phone: '1234567890' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('should reject missing phone', async () => {
    const res = await request(app).post('/api/v1/auth/otp/request').send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

// ─── R5.AC3 / R5.AC7: OTP Verify ─────────────────────────────────
describe('POST /api/v1/auth/otp/verify', () => {
  let validOtp: string;

  beforeEach(async () => {
    // Request an OTP so we can capture the code from the console log
    // The auth service logs the OTP in V0 mode — we read it from the DB instead
    const res = await request(app).post('/api/v1/auth/otp/request').send({ phone: TEST_PHONE });
    expect(res.status).toBe(200);

    // We can't easily read the plain OTP from a hashed store, so we'll
    // generate one directly via the auth service's internal approach.
    // Instead, we insert a known OTP hash into the database.
    // Use bcrypt to hash a known code.
    const bcrypt = await import('bcrypt');
    validOtp = '123456';
    const hash = await bcrypt.hash(validOtp, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Clear previously created OTP and insert our known one
    await sql`DELETE FROM otp_codes WHERE phone = ${TEST_PHONE}`;
    await sql`
      INSERT INTO otp_codes (phone, code_hash, expires_at, used)
      VALUES (${TEST_PHONE}, ${hash}, ${expiresAt.toISOString()}, false)
    `;
  });

  afterEach(async () => {
    await sql`DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE phone = ${TEST_PHONE})`;
    await sql`DELETE FROM otp_codes WHERE phone = ${TEST_PHONE}`;
    await sql`DELETE FROM users WHERE phone = ${TEST_PHONE}`;
  });

  it('R5.AC3: should return accessToken, refreshToken, and user on valid OTP', async () => {
    const res = await request(app).post('/api/v1/auth/otp/verify').send({ phone: TEST_PHONE, code: validOtp });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toHaveProperty('id');
    expect(res.body.user.phone).toBe(TEST_PHONE);

    // Tokens should be valid JWTs
    const accessPayload = jwt.verify(res.body.accessToken, JWT_SECRET) as jwt.JwtPayload;
    expect(accessPayload['userId']).toBe(res.body.user.id);
    expect(accessPayload['phone']).toBe(TEST_PHONE);

    const refreshPayload = jwt.verify(res.body.refreshToken, JWT_REFRESH_SECRET) as jwt.JwtPayload;
    expect(refreshPayload['userId']).toBe(res.body.user.id);
  });

  it('R5.AC4: access token should expire within 1 hour', async () => {
    const res = await request(app).post('/api/v1/auth/otp/verify').send({ phone: TEST_PHONE, code: validOtp });

    expect(res.status).toBe(200);
    const payload = jwt.verify(res.body.accessToken, JWT_SECRET) as jwt.JwtPayload;
    const expiresIn = payload.exp! - payload.iat!;
    expect(expiresIn).toBe(3600); // 1 hour in seconds
  });

  it('R5.AC4: refresh token should expire in 30 days', async () => {
    const res = await request(app).post('/api/v1/auth/otp/verify').send({ phone: TEST_PHONE, code: validOtp });

    expect(res.status).toBe(200);
    const payload = jwt.verify(res.body.refreshToken, JWT_REFRESH_SECRET) as jwt.JwtPayload;
    const expiresIn = payload.exp! - payload.iat!;
    expect(expiresIn).toBe(30 * 24 * 3600); // 30 days in seconds
  });

  it('R5.AC7: should auto-create user on first verify (isNew: true)', async () => {
    // Ensure no user exists for this phone
    await sql`DELETE FROM users WHERE phone = ${TEST_PHONE}`;

    const res = await request(app).post('/api/v1/auth/otp/verify').send({ phone: TEST_PHONE, code: validOtp });

    expect(res.status).toBe(200);
    expect(res.body.user.isNew).toBe(true);

    // Verify user was created in database
    const userRows = await sql`SELECT id, phone FROM users WHERE phone = ${TEST_PHONE}`;
    expect(userRows).toHaveLength(1);
    expect(userRows[0]!['phone']).toBe(TEST_PHONE);
  });

  it('R5.AC7: should return isNew: false for existing user', async () => {
    // Create user first via OTP verify
    const firstRes = await request(app).post('/api/v1/auth/otp/verify').send({ phone: TEST_PHONE, code: validOtp });
    expect(firstRes.status).toBe(200);
    expect(firstRes.body.user.isNew).toBe(true);

    // Insert another valid OTP for the second verify
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('654321', 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await sql`
      INSERT INTO otp_codes (phone, code_hash, expires_at, used)
      VALUES (${TEST_PHONE}, ${hash}, ${expiresAt.toISOString()}, false)
    `;

    const secondRes = await request(app).post('/api/v1/auth/otp/verify').send({ phone: TEST_PHONE, code: '654321' });

    expect(secondRes.status).toBe(200);
    expect(secondRes.body.user.isNew).toBe(false);
    expect(secondRes.body.user.id).toBe(firstRes.body.user.id);
  });

  it('should reject invalid OTP code', async () => {
    const res = await request(app).post('/api/v1/auth/otp/verify').send({ phone: TEST_PHONE, code: '999999' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('OTP_INVALID');
  });

  it('should reject expired OTP', async () => {
    // Insert an expired OTP
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('111111', 10);
    const expiredAt = new Date(Date.now() - 1000); // 1 second ago
    await sql`DELETE FROM otp_codes WHERE phone = ${TEST_PHONE}`;
    await sql`
      INSERT INTO otp_codes (phone, code_hash, expires_at, used)
      VALUES (${TEST_PHONE}, ${hash}, ${expiredAt.toISOString()}, false)
    `;

    const res = await request(app).post('/api/v1/auth/otp/verify').send({ phone: TEST_PHONE, code: '111111' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('OTP_INVALID');
  });

  it('should reject already-used OTP', async () => {
    // First verify should succeed
    const firstRes = await request(app).post('/api/v1/auth/otp/verify').send({ phone: TEST_PHONE, code: validOtp });
    expect(firstRes.status).toBe(200);

    // Second verify with same code should fail (OTP marked as used)
    const secondRes = await request(app).post('/api/v1/auth/otp/verify').send({ phone: TEST_PHONE, code: validOtp });
    expect(secondRes.status).toBe(401);
    expect(secondRes.body.code).toBe('OTP_INVALID');
  });

  it('R5.AC3: should store refresh token hash in database', async () => {
    const res = await request(app).post('/api/v1/auth/otp/verify').send({ phone: TEST_PHONE, code: validOtp });

    expect(res.status).toBe(200);

    // Verify refresh token was stored as a hash
    const tokenRows = await sql`
      SELECT token_hash, revoked, expires_at
      FROM refresh_tokens
      WHERE user_id = (SELECT id FROM users WHERE phone = ${TEST_PHONE})
      ORDER BY created_at DESC
      LIMIT 1
    `;
    expect(tokenRows).toHaveLength(1);
    expect(tokenRows[0]!['revoked']).toBe(false);
    // Token hash should be a SHA-256 hex string (64 chars)
    expect(tokenRows[0]!['token_hash']).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ─── R5.AC5 / R5.AC6: Refresh Token Rotation ─────────────────────
describe('POST /api/v1/auth/refresh', () => {
  let accessToken: string;
  let refreshToken: string;
  let userId: string;

  beforeEach(async () => {
    // Clean state
    await sql`DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE phone = ${TEST_PHONE_2})`;
    await sql`DELETE FROM otp_codes WHERE phone = ${TEST_PHONE_2}`;
    await sql`DELETE FROM users WHERE phone = ${TEST_PHONE_2}`;

    // Insert a known OTP and verify to get tokens
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('123456', 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await sql`
      INSERT INTO otp_codes (phone, code_hash, expires_at, used)
      VALUES (${TEST_PHONE_2}, ${hash}, ${expiresAt.toISOString()}, false)
    `;

    const res = await request(app).post('/api/v1/auth/otp/verify').send({ phone: TEST_PHONE_2, code: '123456' });

    expect(res.status).toBe(200);
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
    userId = res.body.user.id;
  });

  afterEach(async () => {
    await sql`DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE phone = ${TEST_PHONE_2})`;
    await sql`DELETE FROM otp_codes WHERE phone = ${TEST_PHONE_2}`;
    await sql`DELETE FROM users WHERE phone = ${TEST_PHONE_2}`;
  });

  it('R5.AC5: should return new accessToken and refreshToken', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    // New refresh token must differ from old one (rotation)
    expect(res.body.refreshToken).not.toBe(refreshToken);

    // New access token should be valid and contain correct user
    const payload = jwt.verify(res.body.accessToken, JWT_SECRET) as jwt.JwtPayload;
    expect(payload['userId']).toBe(userId);
  });

  it('R5.AC5: should revoke the old refresh token on rotation', async () => {
    await request(app).post('/api/v1/auth/refresh').send({ refreshToken });

    // The original refresh token's hash should be marked as revoked
    const { createHash } = await import('node:crypto');
    const oldHash = createHash('sha256').update(refreshToken).digest('hex');
    const rows = await sql`
      SELECT revoked FROM refresh_tokens
      WHERE token_hash = ${oldHash}
      AND user_id = ${userId}::uuid
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!['revoked']).toBe(true);
  });

  it('R5.AC6: should reject a revoked refresh token', async () => {
    // First refresh — succeeds and revokes the original
    const firstRes = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(firstRes.status).toBe(200);

    // Second refresh with the same (now revoked) token — should fail
    const secondRes = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(secondRes.status).toBe(401);
    expect(secondRes.body.code).toBe('REFRESH_TOKEN_INVALID');
  });

  it('R5.AC5: rotated refresh token should work for subsequent refreshes', async () => {
    // Rotate once
    const firstRes = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(firstRes.status).toBe(200);

    // Use the new refresh token to rotate again
    const secondRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: firstRes.body.refreshToken });
    expect(secondRes.status).toBe(200);
    expect(secondRes.body).toHaveProperty('accessToken');
    expect(secondRes.body).toHaveProperty('refreshToken');
  });

  it('should reject an invalid/tampered refresh token', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: 'not-a-valid-jwt' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('REFRESH_TOKEN_INVALID');
  });

  it('should reject missing refreshToken', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

// ─── R5.AC8 / R5.AC9: Rate Limiting ──────────────────────────────
describe('OTP Rate Limiting', () => {
  const RATE_LIMIT_PHONE = '+966500000099';

  beforeEach(() => {
    clearRateLimitStore();
  });

  afterEach(async () => {
    await sql`DELETE FROM otp_codes WHERE phone = ${RATE_LIMIT_PHONE}`;
  });

  it('R5.AC8: should allow up to 5 OTP requests per phone', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/v1/auth/otp/request').send({ phone: RATE_LIMIT_PHONE });
      expect(res.status).toBe(200);
    }
  });

  it('R5.AC9: should return 429 with Retry-After header on 6th request', async () => {
    // Exhaust the 5-request limit
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/v1/auth/otp/request').send({ phone: RATE_LIMIT_PHONE });
    }

    // 6th request should be rate-limited
    const res = await request(app).post('/api/v1/auth/otp/request').send({ phone: RATE_LIMIT_PHONE });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(res.headers['retry-after']).toBeDefined();
    const retryAfter = parseInt(res.headers['retry-after']!, 10);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(900); // max 15 minutes
  });

  it('R5.AC8: rate limit is per-phone — different phones have separate limits', async () => {
    const otherPhone = '+966500000098';

    // Exhaust limit for RATE_LIMIT_PHONE
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/v1/auth/otp/request').send({ phone: RATE_LIMIT_PHONE });
    }

    // Other phone should still work
    const res = await request(app).post('/api/v1/auth/otp/request').send({ phone: otherPhone });
    expect(res.status).toBe(200);

    // Clean up other phone
    await sql`DELETE FROM otp_codes WHERE phone = ${otherPhone}`;
  });
});

// ─── R5.AC8: JWT Middleware ───────────────────────────────────────
describe('JWT requireAuth middleware', () => {
  const testApp = express();
  testApp.use(express.json());
  testApp.get('/api/v1/test-protected', requireAuth, (req: Request, res: Response) => {
    res.json({ ok: true, userId: req.user?.userId });
  });
  testApp.use(errorHandler(appLogger));

  it('R5.AC8: should reject request without Authorization header', async () => {
    const res = await request(testApp).get('/api/v1/test-protected');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
  });

  it('R5.AC8: should reject request with invalid token', async () => {
    const res = await request(testApp).get('/api/v1/test-protected').set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_INVALID');
  });

  it('R5.AC8: should allow request with valid access token', async () => {
    const { signAccessToken } = await import('../../src/utils/jwt.js');

    const token = signAccessToken({ userId: 'test-user-id', phone: '+966500000001' });
    const res = await request(testApp).get('/api/v1/test-protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.userId).toBe('test-user-id');
  });
});
