/// <reference types="jest" />

import request from 'supertest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import * as schema from '../../src/db/schema.js';
import { createApp } from '../../src/app.js';
import { signAccessToken } from '../../src/utils/jwt.js';

const DATABASE_URL = process.env['DATABASE_URL'] ?? 'postgresql://flod:flod_dev_password@localhost:5433/flod_dev';
const JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long!!';
const JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-chars!!';
const TEST_PHONE = '+966500000098';

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

  // Create test user
  const [user] = await db.insert(schema.users).values({ phone: TEST_PHONE }).returning({ id: schema.users.id });
  token = signAccessToken({ userId: user!.id, phone: TEST_PHONE });
});

afterAll(async () => {
  // Clean up test data
  await db.delete(schema.users).where(eq(schema.users.phone, TEST_PHONE));
  await sql.end();
});

const BASE_ONBOARDING = {
  goal: 'eat_healthy',
  gender: 'male',
  dateOfBirth: '1998-01-01',
  heightCm: 175,
  weightKg: 80,
  activityLevel: 'moderately_active',
  allergies: [],
  whyReasons: [],
  dailyCalories: 2200,
  proteinGrams: 165,
  carbsGrams: 220,
  fatGrams: 73,
};

describe('Hydration onboarding persistence', () => {
  // R6.AC2: Persist hydration fields to users table
  it('should persist hydration fields when included in onboarding payload', async () => {
    const payload = {
      ...BASE_ONBOARDING,
      waterGoalMl: 2500,
      hydrationReminderInterval: '1h',
      beveragePreferences: {
        water: 1500,
        juice: 500,
        teaCoffee: 250,
        smoothies: 250,
      },
    };

    const res = await request(app)
      .post('/api/v1/users/me/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.waterGoalMl).toBe(2500);
    expect(res.body.hydrationReminderInterval).toBe('1h');
    expect(res.body.beveragePreferences).toEqual({
      water: 1500,
      juice: 500,
      teaCoffee: 250,
      smoothies: 250,
    });
  });

  // R6.AC4: Defaults when hydration fields are missing (legacy client)
  it('should use defaults when hydration fields are omitted', async () => {
    // Reset onboarding state first
    await db
      .update(schema.users)
      .set({ onboardingComplete: false, waterGoalMl: null, hydrationReminderInterval: null, beveragePreferences: null })
      .where(eq(schema.users.phone, TEST_PHONE));

    const res = await request(app)
      .post('/api/v1/users/me/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send(BASE_ONBOARDING);

    expect(res.status).toBe(200);
    expect(res.body.waterGoalMl).toBe(2000);
    expect(res.body.hydrationReminderInterval).toBe('2h');
    expect(res.body.beveragePreferences).toBeNull();
  });

  // R6.AC3: GET /users/me includes hydration fields
  it('should include hydration fields in GET /users/me response', async () => {
    // Set known hydration values
    await db
      .update(schema.users)
      .set({
        waterGoalMl: 3000,
        hydrationReminderInterval: '3h',
        beveragePreferences: { water: 2000, juice: 500, teaCoffee: 250, smoothies: 250 },
      })
      .where(eq(schema.users.phone, TEST_PHONE));

    const res = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.waterGoalMl).toBe(3000);
    expect(res.body.hydrationReminderInterval).toBe('3h');
    expect(res.body.beveragePreferences).toEqual({
      water: 2000,
      juice: 500,
      teaCoffee: 250,
      smoothies: 250,
    });
  });

  // R6.AC2: Validates beveragePreferences values
  it('should reject beveragePreferences with values exceeding max', async () => {
    await db.update(schema.users).set({ onboardingComplete: false }).where(eq(schema.users.phone, TEST_PHONE));

    const payload = {
      ...BASE_ONBOARDING,
      beveragePreferences: {
        water: 5000, // exceeds 4000 max
        juice: 0,
        teaCoffee: 0,
        smoothies: 0,
      },
    };

    const res = await request(app)
      .post('/api/v1/users/me/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(400);
  });
});
