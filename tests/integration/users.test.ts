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
const TEST_PHONE = '+966500000088';

let sql: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle<typeof schema>>;
let app: ReturnType<typeof createApp>;
let userId: string;
let token: string;

beforeAll(async () => {
  process.env['JWT_SECRET'] = JWT_SECRET;
  process.env['JWT_REFRESH_SECRET'] = JWT_REFRESH_SECRET;

  sql = postgres(DATABASE_URL, { max: 2 });
  db = drizzle(sql, { schema });

  app = createApp({
    checkDb: async () => true,
    version: '0.1.0-test',
    db,
  });

  // Create a test user
  const rows = await sql`
    INSERT INTO users (phone) VALUES (${TEST_PHONE})
    ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
    RETURNING id
  `;
  userId = rows[0]!['id'] as string;
  token = signAccessToken({ userId, phone: TEST_PHONE });
});

afterAll(async () => {
  await sql`DELETE FROM users WHERE phone = ${TEST_PHONE}`;
  await sql.end();
  delete process.env['JWT_SECRET'];
  delete process.env['JWT_REFRESH_SECRET'];
});

// ─── R14.AC1: Get Profile ────────────────────────────────────────
describe('GET /api/v1/users/me', () => {
  it('R14.AC1: should return the authenticated user profile', async () => {
    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(userId);
    expect(res.body.phone).toBe(TEST_PHONE);
    expect(res.body).toHaveProperty('name');
    expect(res.body).toHaveProperty('email');
    expect(res.body).toHaveProperty('languagePreference');
    expect(res.body).toHaveProperty('createdAt');
  });

  it('should return 404 for non-existent user in token', async () => {
    const badToken = signAccessToken({ userId: '00000000-0000-0000-0000-000000000000', phone: '+966500000000' });
    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${badToken}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  it('should require authentication', async () => {
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(401);
  });
});

// ─── R14.AC2: Update Profile ─────────────────────────────────────
describe('PATCH /api/v1/users/me', () => {
  afterEach(async () => {
    // Reset user to clean state
    await sql`UPDATE users SET name = NULL, email = NULL, language_preference = 'ar' WHERE id = ${userId}::uuid`;
  });

  it('R14.AC2: should update name', async () => {
    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test User' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Test User');
    expect(res.body.phone).toBe(TEST_PHONE);
  });

  it('R14.AC2: should update email', async () => {
    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('test@example.com');
  });

  it('R14.AC2: should update language preference', async () => {
    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ languagePreference: 'en' });

    expect(res.status).toBe(200);
    expect(res.body.languagePreference).toBe('en');
  });

  it('R14.AC2: should update multiple fields at once', async () => {
    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Full Name', email: 'full@example.com', languagePreference: 'en' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Full Name');
    expect(res.body.email).toBe('full@example.com');
    expect(res.body.languagePreference).toBe('en');
  });

  it('R14.AC3: should reject invalid email format', async () => {
    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('should require authentication', async () => {
    const res = await request(app)
      .patch('/api/v1/users/me')
      .send({ name: 'Test' });
    expect(res.status).toBe(401);
  });
});
