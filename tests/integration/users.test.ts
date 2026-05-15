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
  // Reset onboarding fields before delete
  await sql`UPDATE users SET onboarding_complete = false, goal = NULL, gender = NULL, date_of_birth = NULL, activity_level = NULL, height_cm = NULL, weight_kg = NULL, target_weight_kg = NULL, allergies = NULL, daily_calories = NULL, protein_grams = NULL, carbs_grams = NULL, fat_grams = NULL WHERE phone = ${TEST_PHONE}`;
  await sql`DELETE FROM users WHERE phone = ${TEST_PHONE}`;
  await sql.end();
  delete process.env['JWT_SECRET'];
  delete process.env['JWT_REFRESH_SECRET'];
});

// ─── R14.AC1: Get Profile ────────────────────────────────────────
describe('GET /api/v1/users/me', () => {
  it('R14.AC1: should return the authenticated user profile', async () => {
    const res = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${token}`);

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
    const res = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${badToken}`);

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
    const res = await request(app).patch('/api/v1/users/me').send({ name: 'Test' });
    expect(res.status).toBe(401);
  });
});

// ─── R1.AC2 + R2: Onboarding ─────────────────────────────────────

const validOnboarding = {
  goal: 'lose_weight',
  gender: 'male',
  dateOfBirth: '1998-03-15',
  heightCm: 175,
  weightKg: 82,
  targetWeightKg: 72,
  activityLevel: 'moderately_active',
  allergies: ['dairy', 'nuts'],
  dailyCalories: 2104,
  proteinGrams: 158,
  carbsGrams: 210,
  fatGrams: 70,
};

describe('POST /api/v1/users/me/onboarding', () => {
  afterEach(async () => {
    // Reset onboarding fields
    await sql`UPDATE users SET onboarding_complete = false, goal = NULL, gender = NULL, date_of_birth = NULL, activity_level = NULL, height_cm = NULL, weight_kg = NULL, target_weight_kg = NULL, allergies = NULL, daily_calories = NULL, protein_grams = NULL, carbs_grams = NULL, fat_grams = NULL WHERE id = ${userId}::uuid`;
  });

  // R2.AC1: submit onboarding data
  it('R2.AC1: should save onboarding data and return updated profile', async () => {
    const res = await request(app)
      .post('/api/v1/users/me/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send(validOnboarding);

    expect(res.status).toBe(200);
    expect(res.body.goal).toBe('lose_weight');
    expect(res.body.gender).toBe('male');
    expect(res.body.dateOfBirth).toBe('1998-03-15');
    expect(Number(res.body.heightCm)).toBe(175);
    expect(Number(res.body.weightKg)).toBe(82);
    expect(Number(res.body.targetWeightKg)).toBe(72);
    expect(res.body.activityLevel).toBe('moderately_active');
    expect(res.body.allergies).toEqual(['dairy', 'nuts']);
    expect(res.body.dailyCalories).toBe(2104);
    expect(Number(res.body.proteinGrams)).toBe(158);
    expect(Number(res.body.carbsGrams)).toBe(210);
    expect(Number(res.body.fatGrams)).toBe(70);
  });

  // R2.AC4: onboardingComplete set to true
  it('R2.AC4: should set onboardingComplete to true', async () => {
    const res = await request(app)
      .post('/api/v1/users/me/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send(validOnboarding);

    expect(res.status).toBe(200);
    expect(res.body.onboardingComplete).toBe(true);
  });

  // R2.AC5: missing required fields returns 400
  it('R2.AC5: should return 400 for missing required fields', async () => {
    const res = await request(app)
      .post('/api/v1/users/me/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send({ goal: 'lose_weight' }); // missing most fields

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  // R2.AC5: invalid enum value returns 400
  it('R2.AC5: should return 400 for invalid enum values', async () => {
    const res = await request(app)
      .post('/api/v1/users/me/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validOnboarding, goal: 'invalid_goal' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('should require authentication', async () => {
    const res = await request(app).post('/api/v1/users/me/onboarding').send(validOnboarding);
    expect(res.status).toBe(401);
  });
});

// ─── R4: Update Onboarding ──────────────────────────────────────
describe('PUT /api/v1/users/me/onboarding', () => {
  beforeEach(async () => {
    // Set initial onboarding data
    await request(app)
      .post('/api/v1/users/me/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send(validOnboarding);
  });

  afterEach(async () => {
    await sql`UPDATE users SET onboarding_complete = false, goal = NULL, gender = NULL, date_of_birth = NULL, activity_level = NULL, height_cm = NULL, weight_kg = NULL, target_weight_kg = NULL, allergies = NULL, daily_calories = NULL, protein_grams = NULL, carbs_grams = NULL, fat_grams = NULL WHERE id = ${userId}::uuid`;
  });

  // R4.AC1 + R4.AC2: update overwrites all fields
  it('R4.AC1: should overwrite onboarding data with new values', async () => {
    const updated = {
      ...validOnboarding,
      goal: 'build_muscle',
      activityLevel: 'very_active',
      dailyCalories: 2800,
      proteinGrams: 210,
      carbsGrams: 280,
      fatGrams: 93,
    };

    const res = await request(app)
      .put('/api/v1/users/me/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send(updated);

    expect(res.status).toBe(200);
    expect(res.body.goal).toBe('build_muscle');
    expect(res.body.activityLevel).toBe('very_active');
    expect(res.body.dailyCalories).toBe(2800);
    expect(res.body.onboardingComplete).toBe(true);
  });

  it('should require authentication', async () => {
    const res = await request(app).put('/api/v1/users/me/onboarding').send(validOnboarding);
    expect(res.status).toBe(401);
  });
});

// ─── R1.AC2 + R3.AC1: GET /me returns onboarding fields ────────
describe('GET /api/v1/users/me (with onboarding)', () => {
  beforeAll(async () => {
    await request(app)
      .post('/api/v1/users/me/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send(validOnboarding);
  });

  afterAll(async () => {
    await sql`UPDATE users SET onboarding_complete = false, goal = NULL, gender = NULL, date_of_birth = NULL, activity_level = NULL, height_cm = NULL, weight_kg = NULL, target_weight_kg = NULL, allergies = NULL, daily_calories = NULL, protein_grams = NULL, carbs_grams = NULL, fat_grams = NULL WHERE id = ${userId}::uuid`;
  });

  // R1.AC2: profile includes onboarding fields
  it('R1.AC2: should return onboarding fields in GET /me', async () => {
    const res = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.onboardingComplete).toBe(true);
    expect(res.body.goal).toBe('lose_weight');
    expect(res.body.gender).toBe('male');
    expect(res.body.dateOfBirth).toBe('1998-03-15');
    expect(res.body.dailyCalories).toBe(2104);
    expect(res.body.allergies).toEqual(['dairy', 'nuts']);
  });

  // R3.AC1: new user without onboarding
  it('R3.AC1: should return onboardingComplete=false for new user', async () => {
    // Use a different token for a "new" user check
    const newPhone = '+966500000089';
    const rows = await sql`
      INSERT INTO users (phone) VALUES (${newPhone})
      ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
      RETURNING id
    `;
    const newUserId = rows[0]!['id'] as string;
    const newToken = signAccessToken({ userId: newUserId, phone: newPhone });

    const res = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${newToken}`);

    expect(res.status).toBe(200);
    expect(res.body.onboardingComplete).toBe(false);
    expect(res.body.goal).toBeNull();

    // Cleanup
    await sql`DELETE FROM users WHERE phone = ${newPhone}`;
  });
});
