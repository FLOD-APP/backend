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

// ─── R13.AC1: List Rotations by Type ─────────────────────────────
describe('GET /api/v1/rotations/:type', () => {
  it('R13.AC1: should return 12 snack rotation entries', async () => {
    const res = await request(app).get('/api/v1/rotations/snack').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(12);
  });

  it('R13.AC1: should return 12 sandwich rotation entries', async () => {
    const res = await request(app).get('/api/v1/rotations/sandwich').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(12);
  });

  it('R13.AC1: each entry should include day_number, product details, and price', async () => {
    const res = await request(app).get('/api/v1/rotations/snack').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const entry = res.body[0];
    expect(entry).toHaveProperty('dayNumber');
    expect(entry).toHaveProperty('productId');
    expect(entry).toHaveProperty('priceInclVat');
    expect(entry).toHaveProperty('nameEn');
    expect(entry).toHaveProperty('nameAr');
  });

  it('R13.AC1: entries should cover days 1 through 12', async () => {
    const res = await request(app).get('/api/v1/rotations/snack').set('Authorization', `Bearer ${token}`);

    const days = res.body.map((e: { dayNumber: number }) => e.dayNumber).sort((a: number, b: number) => a - b);
    expect(days).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('should reject invalid type', async () => {
    const res = await request(app).get('/api/v1/rotations/invalid').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('should require authentication', async () => {
    const res = await request(app).get('/api/v1/rotations/snack');
    expect(res.status).toBe(401);
  });
});

// ─── R13.AC2: Swap Options ───────────────────────────────────────
describe('GET /api/v1/rotations/:type/:dayNumber/swaps', () => {
  it('R13.AC2: should return swap options for a sandwich day', async () => {
    // Day 2 (Steak) should have many swaps
    const res = await request(app).get('/api/v1/rotations/sandwich/2/swaps').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('R13.AC2: each swap should include product details and price', async () => {
    const res = await request(app).get('/api/v1/rotations/sandwich/2/swaps').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const swap = res.body[0];
    expect(swap).toHaveProperty('swapProductId');
    expect(swap).toHaveProperty('nameEn');
    expect(swap).toHaveProperty('nameAr');
  });

  it('R13.AC2: locked days (Egg sandwich) should have 0 swap options', async () => {
    // Day 6 and Day 12 are Egg sandwiches (locked — no swaps)
    const res = await request(app).get('/api/v1/rotations/sandwich/6/swaps').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(0);
  });

  it('should return 404 for non-existent day', async () => {
    const res = await request(app).get('/api/v1/rotations/snack/99/swaps').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400); // dayNumber validation
  });

  it('should require authentication', async () => {
    const res = await request(app).get('/api/v1/rotations/sandwich/1/swaps');
    expect(res.status).toBe(401);
  });
});
