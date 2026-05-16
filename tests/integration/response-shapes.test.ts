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

// ─── R2.AC1: Product list shape ────────────────────────────────────
describe('R2.AC1: Product list response shape', () => {
  it('should include all required camelCase fields', async () => {
    const res = await request(app).get('/v1/products?tier=base').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);

    const product = res.body[0];
    expect(product).toHaveProperty('categoryId');
    expect(product).toHaveProperty('nameEn');
    expect(product).toHaveProperty('nameAr');
    expect(product).toHaveProperty('proteinG');
    expect(product).toHaveProperty('carbsG');
    expect(product).toHaveProperty('fatG');
    expect(product).toHaveProperty('priceInclVat');
    expect(product).toHaveProperty('allergens');
    expect(product).toHaveProperty('proteinType');
    expect(product).toHaveProperty('isFree');
  });
});

// ─── R2.AC2: Product detail shape with prices array ────────────────
describe('R2.AC2: Product detail response shape', () => {
  it('should include a prices array with tier, priceInclVat, currency', async () => {
    const listRes = await request(app).get('/v1/products?tier=base').set('Authorization', `Bearer ${token}`);
    const productId = listRes.body[0].id;

    const res = await request(app).get(`/v1/products/${productId}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('prices');
    expect(Array.isArray(res.body.prices)).toBe(true);
    expect(res.body.prices.length).toBeGreaterThan(0);

    const price = res.body.prices[0];
    expect(price).toHaveProperty('tier');
    expect(price).toHaveProperty('priceInclVat');
    expect(price).toHaveProperty('currency');
  });
});

// ─── R2.AC3: Package list shape ────────────────────────────────────
describe('R2.AC3: Package list response shape', () => {
  it('should include all required fields', async () => {
    const res = await request(app).get('/v1/packages').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);

    const pkg = res.body[0];
    expect(pkg).toHaveProperty('category');
    expect(pkg).toHaveProperty('nameEn');
    expect(pkg).toHaveProperty('nameAr');
    expect(pkg).toHaveProperty('mealsPerDay');
    expect(pkg).toHaveProperty('durationDays');
    expect(pkg).toHaveProperty('totalMeals');
    expect(pkg).toHaveProperty('priceInclVat');
    expect(pkg).toHaveProperty('sortOrder');
  });
});

// ─── R2.AC4: Package schedule shape ────────────────────────────────
describe('R2.AC4: Package schedule response shape', () => {
  it('should return a schedule array with required slot fields', async () => {
    const pkgRes = await request(app).get('/v1/packages').set('Authorization', `Bearer ${token}`);
    const packageId = pkgRes.body[0].id;

    const res = await request(app).get(`/v1/packages/${packageId}/schedule`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('packageId');
    expect(res.body).toHaveProperty('schedule');
    expect(Array.isArray(res.body.schedule)).toBe(true);
    expect(res.body.schedule.length).toBeGreaterThan(0);

    const slot = res.body.schedule[0];
    expect(slot).toHaveProperty('day');
    expect(slot).toHaveProperty('slot');
    expect(slot).toHaveProperty('proteinType');
    expect(slot).toHaveProperty('productId');
    expect(slot).toHaveProperty('nameEn');
    expect(slot).toHaveProperty('nameAr');
    expect(slot).toHaveProperty('priceInclVat');
  });
});

// ─── R2.AC5: Branch list shape ─────────────────────────────────────
describe('R2.AC5: Branch list response shape', () => {
  it('should include all required fields', async () => {
    const res = await request(app).get('/v1/branches').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);

    const branch = res.body[0];
    expect(branch).toHaveProperty('foodicsRef');
    expect(branch).toHaveProperty('type');
    expect(branch).toHaveProperty('expressClassification');
    expect(branch).toHaveProperty('latitude');
    expect(branch).toHaveProperty('longitude');
    expect(branch).toHaveProperty('openHour');
    expect(branch).toHaveProperty('closeHour');
    expect(branch).toHaveProperty('isStage0');
  });
});
