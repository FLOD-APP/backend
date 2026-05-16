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
const TEST_PHONE = '+966500000097';

let sql: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle<typeof schema>>;
let app: ReturnType<typeof createApp>;
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
  const userId = rows[0]!['id'] as string;
  token = signAccessToken({ userId, phone: TEST_PHONE });

  // Ensure seed data exists for goal_why_matrix
  await sql`
    INSERT INTO goal_why_matrix (goal, top_reasons, locked_reasons)
    VALUES
      ('eat_healthy', '["eat_healthier", "track_calories"]'::jsonb, '[]'::jsonb),
      ('lose_weight', '["lose_weight", "track_calories"]'::jsonb, '[]'::jsonb),
      ('build_muscle', '["build_muscle", "eat_healthier"]'::jsonb, '[]'::jsonb),
      ('maintain_weight', '["track_calories", "eat_healthier"]'::jsonb, '[]'::jsonb),
      ('gain_weight', '["track_calories", "build_muscle"]'::jsonb, '["lose_weight"]'::jsonb)
    ON CONFLICT (goal) DO NOTHING
  `;
});

afterAll(async () => {
  await sql`DELETE FROM users WHERE phone = ${TEST_PHONE}`;
  await sql.end();
  delete process.env['JWT_SECRET'];
  delete process.env['JWT_REFRESH_SECRET'];
});

// ─── R2.AC1: Fetch matrix for valid goal ───────────────────────────
describe('GET /api/v1/users/me/onboarding/why-matrix', () => {
  // R2.AC1: Returns top and locked arrays for a valid goal
  it('R2.AC1: should return top and locked arrays for gain_weight', async () => {
    const res = await request(app)
      .get('/api/v1/users/me/onboarding/why-matrix?goal=gain_weight')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.top).toEqual(['track_calories', 'build_muscle']);
    expect(res.body.locked).toEqual(['lose_weight']);
  });

  // R2.AC1: Returns correct data for a goal with no locked items
  it('R2.AC1: should return empty locked array for eat_healthy', async () => {
    const res = await request(app)
      .get('/api/v1/users/me/onboarding/why-matrix?goal=eat_healthy')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.top).toEqual(['eat_healthier', 'track_calories']);
    expect(res.body.locked).toEqual([]);
  });

  // R2.AC2: Returns 400 for an unrecognised goal
  it('R2.AC2: should return 400 for invalid goal value', async () => {
    const res = await request(app)
      .get('/api/v1/users/me/onboarding/why-matrix?goal=fly_to_moon')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_GOAL');
  });

  // R2.AC2: Returns 400 when goal param is missing
  it('R2.AC2: should return 400 when goal query param is missing', async () => {
    const res = await request(app)
      .get('/api/v1/users/me/onboarding/why-matrix')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_GOAL');
  });

  // R2.AC3: Requires authentication
  it('R2.AC3: should return 401 without auth token', async () => {
    const res = await request(app).get('/api/v1/users/me/onboarding/why-matrix?goal=gain_weight');

    expect(res.status).toBe(401);
  });

  // R2.AC1: Verify all 5 goals return valid data
  it('R2.AC1: should return valid data for all 5 goals', async () => {
    const goals = ['eat_healthy', 'lose_weight', 'build_muscle', 'maintain_weight', 'gain_weight'];

    for (const goal of goals) {
      const res = await request(app)
        .get(`/api/v1/users/me/onboarding/why-matrix?goal=${goal}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.top)).toBe(true);
      expect(Array.isArray(res.body.locked)).toBe(true);
      expect(res.body.top.length).toBeGreaterThanOrEqual(2);
    }
  });
});
