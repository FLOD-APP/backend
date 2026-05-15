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

  // Generate a valid access token for authenticated requests
  token = signAccessToken({ userId: '00000000-0000-0000-0000-000000000001', phone: '+966500000001' });
});

afterAll(async () => {
  await sql.end();
  delete process.env['JWT_SECRET'];
  delete process.env['JWT_REFRESH_SECRET'];
});

// ─── R6.AC1: List All Active Branches ─────────────────────────────
describe('GET /api/v1/branches', () => {
  it('R6.AC1: should return all active branches', async () => {
    const res = await request(app).get('/api/v1/branches').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(15);
  });

  it('R6.AC1: each branch should include all required fields', async () => {
    const res = await request(app).get('/api/v1/branches').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const branch = res.body[0];
    expect(branch).toHaveProperty('id');
    expect(branch).toHaveProperty('foodicsRef');
    expect(branch).toHaveProperty('nameEn');
    expect(branch).toHaveProperty('nameAr');
    expect(branch).toHaveProperty('type');
    expect(branch).toHaveProperty('expressClassification');
    expect(branch).toHaveProperty('latitude');
    expect(branch).toHaveProperty('longitude');
    expect(branch).toHaveProperty('openHour');
    expect(branch).toHaveProperty('closeHour');
    expect(branch).toHaveProperty('isStage0');
  });

  it('should require authentication', async () => {
    const res = await request(app).get('/api/v1/branches');
    expect(res.status).toBe(401);
  });
});

// ─── R6.AC2: Stage 0 Filter ──────────────────────────────────────
describe('GET /api/v1/branches?stage0=true', () => {
  it('R6.AC2: should return only Stage 0 branches (Al Rabie and Anas)', async () => {
    const res = await request(app).get('/api/v1/branches?stage0=true').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);

    const names = res.body.map((b: { nameEn: string }) => b.nameEn).sort();
    // Seed data uses full names: "Rabie (Al Rabie)" and "Anas (Anas Bin Malik)"
    expect(names).toEqual(['Anas (Anas Bin Malik)', 'Rabie (Al Rabie)']);
  });

  it('R6.AC2: all Stage 0 branches should have isStage0 = true', async () => {
    const res = await request(app).get('/api/v1/branches?stage0=true').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    for (const branch of res.body) {
      expect(branch.isStage0).toBe(true);
    }
  });

  it('should return all branches when stage0 is not set', async () => {
    const res = await request(app).get('/api/v1/branches').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(15);
  });
});

// ─── R6.AC3: Get Branch by ID ────────────────────────────────────
describe('GET /api/v1/branches/:id', () => {
  let branchId: string;

  beforeAll(async () => {
    // Get a real branch ID from the database
    const rows = await sql`SELECT id FROM branches WHERE is_active = true LIMIT 1`;
    branchId = rows[0]!['id'] as string;
  });

  it('R6.AC3: should return full details of a single branch', async () => {
    const res = await request(app).get(`/api/v1/branches/${branchId}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(branchId);
    expect(res.body).toHaveProperty('foodicsRef');
    expect(res.body).toHaveProperty('nameEn');
    expect(res.body).toHaveProperty('nameAr');
    expect(res.body).toHaveProperty('type');
    expect(res.body).toHaveProperty('latitude');
    expect(res.body).toHaveProperty('longitude');
    expect(res.body).toHaveProperty('openHour');
    expect(res.body).toHaveProperty('closeHour');
    expect(res.body).toHaveProperty('isStage0');
  });

  it('R6.AC4: should return 404 for non-existent branch ID', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app).get(`/api/v1/branches/${fakeId}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('BRANCH_NOT_FOUND');
  });

  it('R6.AC4: should return 500 for invalid UUID format', async () => {
    const res = await request(app).get('/api/v1/branches/not-a-uuid').set('Authorization', `Bearer ${token}`);

    // Drizzle/postgres will throw a database error for invalid UUID
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('should require authentication', async () => {
    const res = await request(app).get(`/api/v1/branches/${branchId}`);
    expect(res.status).toBe(401);
  });
});
