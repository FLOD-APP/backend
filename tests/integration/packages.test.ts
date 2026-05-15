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

// ─── R8.AC1: List Packages ───────────────────────────────────────
describe('GET /api/v1/packages', () => {
  it('R8.AC1: should return all active packages', async () => {
    const res = await request(app).get('/api/v1/packages').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // 24 active packages (customer_choice packages are inactive)
    expect(res.body.length).toBe(24);
  });

  it('R8.AC1: each package should include required fields', async () => {
    const res = await request(app).get('/api/v1/packages').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const pkg = res.body[0];
    expect(pkg).toHaveProperty('id');
    expect(pkg).toHaveProperty('category');
    expect(pkg).toHaveProperty('nameEn');
    expect(pkg).toHaveProperty('nameAr');
    expect(pkg).toHaveProperty('mealsPerDay');
    expect(pkg).toHaveProperty('durationDays');
    expect(pkg).toHaveProperty('totalMeals');
    expect(pkg).toHaveProperty('priceInclVat');
    expect(pkg).toHaveProperty('sortOrder');
  });

  it('should require authentication', async () => {
    const res = await request(app).get('/api/v1/packages');
    expect(res.status).toBe(401);
  });
});

// ─── R8.AC2: Filter by Category ──────────────────────────────────
describe('GET /api/v1/packages?category=...', () => {
  it('R8.AC2: should return only mixed packages', async () => {
    const res = await request(app).get('/api/v1/packages?category=mixed').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(9); // 3 durations × 3 meals_per_day
    for (const pkg of res.body) {
      expect(pkg.category).toBe('mixed');
    }
  });

  it('R8.AC2: should return only chicken packages', async () => {
    const res = await request(app).get('/api/v1/packages?category=chicken').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(9);
    for (const pkg of res.body) {
      expect(pkg.category).toBe('chicken');
    }
  });

  it('R8.AC2: should return only snack packages', async () => {
    const res = await request(app).get('/api/v1/packages?category=snack').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(3); // snack: 1 meal × 3 durations
    for (const pkg of res.body) {
      expect(pkg.category).toBe('snack');
    }
  });

  it('should reject invalid category', async () => {
    const res = await request(app).get('/api/v1/packages?category=invalid').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

// ─── R8.AC3: Package Detail with Distribution ────────────────────
describe('GET /api/v1/packages/:id', () => {
  let mixedPackageId: string;

  beforeAll(async () => {
    const rows = await sql`
      SELECT id FROM packages WHERE category = 'mixed' AND meals_per_day = 1 AND duration_days = 12 LIMIT 1
    `;
    mixedPackageId = rows[0]!['id'] as string;
  });

  it('R8.AC3: should return package with meal distribution', async () => {
    const res = await request(app).get(`/api/v1/packages/${mixedPackageId}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(mixedPackageId);
    expect(res.body).toHaveProperty('mealDistribution');
    expect(Array.isArray(res.body.mealDistribution)).toBe(true);
    expect(res.body.mealDistribution.length).toBeGreaterThan(0);
  });

  it('R8.AC3: meal distribution should include proteinType and mealCount', async () => {
    const res = await request(app).get(`/api/v1/packages/${mixedPackageId}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    for (const dist of res.body.mealDistribution) {
      expect(dist).toHaveProperty('proteinType');
      expect(dist).toHaveProperty('mealCount');
      expect(typeof dist.mealCount).toBe('number');
    }
  });

  it('R8.AC3: distribution meal counts should sum to totalMeals', async () => {
    const res = await request(app).get(`/api/v1/packages/${mixedPackageId}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const totalFromDist = res.body.mealDistribution.reduce(
      (sum: number, d: { mealCount: number }) => sum + d.mealCount,
      0,
    );
    expect(totalFromDist).toBe(res.body.totalMeals);
  });

  it('should return 404 for non-existent package', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app).get(`/api/v1/packages/${fakeId}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PACKAGE_NOT_FOUND');
  });

  it('should require authentication', async () => {
    const res = await request(app).get(`/api/v1/packages/${mixedPackageId}`);
    expect(res.status).toBe(401);
  });
});

// ─── R8.AC4: Schedule Generation ─────────────────────────────────
describe('GET /api/v1/packages/:id/schedule', () => {
  let mixedPackageId: string;
  let mixedTotalMeals: number;

  beforeAll(async () => {
    const rows = await sql`
      SELECT id, total_meals FROM packages WHERE category = 'mixed' AND meals_per_day = 1 AND duration_days = 12 LIMIT 1
    `;
    mixedPackageId = rows[0]!['id'] as string;
    mixedTotalMeals = rows[0]!['total_meals'] as number;
  });

  it('R8.AC4: should return a schedule with correct number of days', async () => {
    const res = await request(app)
      .get(`/api/v1/packages/${mixedPackageId}/schedule`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('packageId', mixedPackageId);
    expect(res.body).toHaveProperty('schedule');
    expect(Array.isArray(res.body.schedule)).toBe(true);
    expect(res.body.schedule.length).toBe(mixedTotalMeals);
  });

  it('R8.AC4: each schedule entry should have day, slot, product info', async () => {
    const res = await request(app)
      .get(`/api/v1/packages/${mixedPackageId}/schedule`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const entry = res.body.schedule[0];
    expect(entry).toHaveProperty('day');
    expect(entry).toHaveProperty('slot');
    expect(entry).toHaveProperty('proteinType');
    expect(entry).toHaveProperty('productId');
    expect(entry).toHaveProperty('nameEn');
    expect(entry).toHaveProperty('priceInclVat');
  });

  it('R8.AC4: schedule days should be sequential starting from 1', async () => {
    const res = await request(app)
      .get(`/api/v1/packages/${mixedPackageId}/schedule`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // For 1-meal-per-day package, days should be 1..12
    const days = res.body.schedule.map((e: { day: number }) => e.day);
    for (let i = 0; i < days.length; i++) {
      expect(days[i]).toBe(i + 1);
    }
  });

  it('R8.AC4: schedule should have variety (multiple protein types for mixed)', async () => {
    const res = await request(app)
      .get(`/api/v1/packages/${mixedPackageId}/schedule`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const proteinTypes = new Set(res.body.schedule.map((e: { proteinType: string }) => e.proteinType));
    // Mixed package should have at least 3 different protein types
    expect(proteinTypes.size).toBeGreaterThanOrEqual(3);
  });

  it('should return 404 for non-existent package', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app).get(`/api/v1/packages/${fakeId}/schedule`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PACKAGE_NOT_FOUND');
  });

  it('should require authentication', async () => {
    const res = await request(app).get(`/api/v1/packages/${mixedPackageId}/schedule`);
    expect(res.status).toBe(401);
  });
});
