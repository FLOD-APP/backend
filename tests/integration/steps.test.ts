/// <reference types="jest" />

import request from 'supertest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and } from 'drizzle-orm';
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
let userId: string;

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
  userId = user!.id;
  token = signAccessToken({ userId, phone: TEST_PHONE });
});

afterAll(async () => {
  // Clean up test data (leaf tables first)
  await db.delete(schema.dailySteps).where(eq(schema.dailySteps.userId, userId));
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

describe('Steps onboarding persistence', () => {
  // R5.AC1: Persist step fields when included in onboarding payload
  it('should persist step fields when included in onboarding payload', async () => {
    const payload = {
      ...BASE_ONBOARDING,
      dailyStepGoal: 12000,
      healthKitEnabled: true,
      addStepsToCalories: true,
    };

    const res = await request(app)
      .post('/api/v1/users/me/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.dailyStepGoal).toBe(12000);
    expect(res.body.healthKitEnabled).toBe(true);
    expect(res.body.addStepsToCalories).toBe(true);
  });

  // R5.AC2, R5.AC3, R5.AC4: Defaults when step fields are omitted
  it('should use defaults when step fields are omitted', async () => {
    // Reset onboarding state
    await db.update(schema.users).set({ onboardingComplete: false }).where(eq(schema.users.phone, TEST_PHONE));

    const res = await request(app)
      .post('/api/v1/users/me/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send(BASE_ONBOARDING);

    expect(res.status).toBe(200);
    expect(res.body.dailyStepGoal).toBe(10000);
    expect(res.body.healthKitEnabled).toBe(false);
    expect(res.body.addStepsToCalories).toBe(false);
  });

  // R5.AC5: GET /users/me includes step fields
  it('should include step fields in GET /users/me response', async () => {
    // Set known step values
    await db
      .update(schema.users)
      .set({
        dailyStepGoal: 15000,
        healthKitEnabled: true,
        addStepsToCalories: true,
      })
      .where(eq(schema.users.phone, TEST_PHONE));

    const res = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.dailyStepGoal).toBe(15000);
    expect(res.body.healthKitEnabled).toBe(true);
    expect(res.body.addStepsToCalories).toBe(true);
  });

  // R5.AC2: Validates dailyStepGoal range (min 3000, max 25000)
  it('should reject dailyStepGoal below minimum', async () => {
    await db.update(schema.users).set({ onboardingComplete: false }).where(eq(schema.users.phone, TEST_PHONE));

    const payload = {
      ...BASE_ONBOARDING,
      dailyStepGoal: 1000, // below 3000 minimum
    };

    const res = await request(app)
      .post('/api/v1/users/me/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(400);
  });

  // R5.AC2: Validates dailyStepGoal range (max 25000)
  it('should reject dailyStepGoal above maximum', async () => {
    await db.update(schema.users).set({ onboardingComplete: false }).where(eq(schema.users.phone, TEST_PHONE));

    const payload = {
      ...BASE_ONBOARDING,
      dailyStepGoal: 50000, // above 25000 maximum
    };

    const res = await request(app)
      .post('/api/v1/users/me/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(400);
  });
});

describe('PUT /users/me/steps — daily step sync', () => {
  const todayStr = new Date().toISOString().slice(0, 10);

  // R6.AC1 + R6.AC2: Insert new step record for today
  it('should insert a step record for today', async () => {
    const res = await request(app)
      .put('/api/v1/users/me/steps')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: todayStr, steps: 5000 });

    expect(res.status).toBe(200);
    expect(res.body.steps).toBe(5000);
    expect(res.body.date).toBe(todayStr);
    expect(res.body.userId).toBe(userId);
  });

  // R6.AC3: Upsert — update existing record for same date
  it('should upsert step count for existing date (update, not duplicate)', async () => {
    const res = await request(app)
      .put('/api/v1/users/me/steps')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: todayStr, steps: 8500 });

    expect(res.status).toBe(200);
    expect(res.body.steps).toBe(8500);

    // Verify no duplicates
    const rows = await db
      .select()
      .from(schema.dailySteps)
      .where(and(eq(schema.dailySteps.userId, userId), eq(schema.dailySteps.date, todayStr)));
    expect(rows.length).toBe(1);
  });

  // R6.AC5: Reject negative step count
  it('should reject negative step count', async () => {
    const res = await request(app)
      .put('/api/v1/users/me/steps')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: todayStr, steps: -100 });

    expect(res.status).toBe(400);
  });

  // R6.AC5: Reject date that is not today or yesterday
  it('should reject date older than yesterday', async () => {
    const oldDate = new Date();
    oldDate.setUTCDate(oldDate.getUTCDate() - 3);
    const oldDateStr = oldDate.toISOString().slice(0, 10);

    const res = await request(app)
      .put('/api/v1/users/me/steps')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: oldDateStr, steps: 3000 });

    expect(res.status).toBe(422);
  });

  // R6.AC5: Accept yesterday's date
  it('should accept yesterday as a valid date', async () => {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const res = await request(app)
      .put('/api/v1/users/me/steps')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: yesterdayStr, steps: 7200 });

    expect(res.status).toBe(200);
    expect(res.body.steps).toBe(7200);
    expect(res.body.date).toBe(yesterdayStr);
  });
});
