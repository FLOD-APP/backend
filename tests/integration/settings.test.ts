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

let sql: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle<typeof schema>>;
let app: ReturnType<typeof createApp>;
let token: string;

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

  token = signAccessToken({ userId: '00000000-0000-0000-0000-000000000001', phone: '+966500000001' });
});

afterAll(async () => {
  await sql.end();
  delete process.env['JWT_SECRET'];
  delete process.env['JWT_REFRESH_SECRET'];
});

// ─── R16.AC1: List Settings ──────────────────────────────────────
describe('GET /api/v1/settings', () => {
  it('R16.AC1: should return all system settings', async () => {
    const res = await request(app)
      .get('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(6);
  });

  it('R16.AC1: each setting should have key, value, description', async () => {
    const res = await request(app)
      .get('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const setting = res.body[0];
    expect(setting).toHaveProperty('key');
    expect(setting).toHaveProperty('value');
    expect(setting).toHaveProperty('description');
  });

  it('R16.AC1: should include vat_rate setting', async () => {
    const res = await request(app)
      .get('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const vatSetting = res.body.find((s: { key: string }) => s.key === 'vat_rate');
    expect(vatSetting).toBeDefined();
    expect(vatSetting.value).toBe('0.15');
  });

  it('should require authentication', async () => {
    const res = await request(app).get('/api/v1/settings');
    expect(res.status).toBe(401);
  });
});

// ─── R16.AC2: Update Setting ─────────────────────────────────────
describe('PATCH /api/v1/settings/:key', () => {
  const TEST_KEY = 'vat_rate';
  let originalValue: string;

  beforeAll(async () => {
    const rows = await sql`SELECT value FROM system_settings WHERE key = ${TEST_KEY}`;
    originalValue = rows[0]!['value'] as string;
  });

  afterAll(async () => {
    // Restore original value
    await sql`UPDATE system_settings SET value = ${originalValue} WHERE key = ${TEST_KEY}`;
  });

  it('R16.AC2: should update the setting and return updated record', async () => {
    const res = await request(app)
      .patch(`/api/v1/settings/${TEST_KEY}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: '20' });

    expect(res.status).toBe(200);
    expect(res.body.key).toBe(TEST_KEY);
    expect(res.body.value).toBe('20');
  });

  it('R16.AC3: should return 404 for non-existent key', async () => {
    const res = await request(app)
      .patch('/api/v1/settings/nonexistent_key')
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 'test' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('SETTING_NOT_FOUND');
  });

  it('should reject missing value', async () => {
    const res = await request(app)
      .patch(`/api/v1/settings/${TEST_KEY}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('should require authentication', async () => {
    const res = await request(app)
      .patch(`/api/v1/settings/${TEST_KEY}`)
      .send({ value: '10' });
    expect(res.status).toBe(401);
  });
});
