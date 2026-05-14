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

// ─── R1.AC2: Categories via /v1 ────────────────────────────────────
describe('GET /v1/categories', () => {
  it('R1.AC2: should route to the categories list handler', async () => {
    const res = await request(app).get('/v1/categories').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('nameEn');
  });
});

// ─── R1.AC1: Products via /v1 ──────────────────────────────────────
describe('GET /v1/products', () => {
  it('R1.AC1: should route to the products list handler', async () => {
    const res = await request(app).get('/v1/products?tier=base').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('R1.AC1: product detail should work via /v1', async () => {
    const listRes = await request(app).get('/v1/products?tier=base').set('Authorization', `Bearer ${token}`);
    const productId = listRes.body[0].id;

    const detailRes = await request(app).get(`/v1/products/${productId}`).set('Authorization', `Bearer ${token}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body).toHaveProperty('id', productId);
    expect(detailRes.body).toHaveProperty('prices');
  });
});

// ─── R1.AC3: Packages via /v1 ──────────────────────────────────────
describe('GET /v1/packages', () => {
  it('R1.AC3: should route to the packages list handler', async () => {
    const res = await request(app).get('/v1/packages').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

// ─── R1.AC4: Branches via /v1 ──────────────────────────────────────
describe('GET /v1/branches', () => {
  it('R1.AC4: should route to the branches list handler', async () => {
    const res = await request(app).get('/v1/branches').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

// ─── R1.AC5: Rotations via /v1 ─────────────────────────────────────
describe('GET /v1/rotations/:type', () => {
  it('R1.AC5: should route to the rotations list handler', async () => {
    const res = await request(app).get('/v1/rotations/snack').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ─── R1.AC6: Pricing via /v1 ───────────────────────────────────────
describe('POST /v1/pricing/calculate', () => {
  it('R1.AC6: should route to the pricing calculation handler', async () => {
    // Get a valid package ID first
    const pkgRes = await request(app).get('/v1/packages').set('Authorization', `Bearer ${token}`);
    const packageId = pkgRes.body[0].id;

    const res = await request(app)
      .post('/v1/pricing/calculate')
      .set('Authorization', `Bearer ${token}`)
      .send({ packageId });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalInclVat');
  });
});

// ─── R1.AC7: Backward compatibility ────────────────────────────────
describe('Backward compatibility: /api/v1 paths still work', () => {
  it('R1.AC7: GET /api/v1/categories should still work', async () => {
    const res = await request(app).get('/api/v1/categories').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('R1.AC7: GET /api/v1/products should still work', async () => {
    const res = await request(app).get('/api/v1/products?tier=base').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('R1.AC7: GET /api/v1/branches should still work', async () => {
    const res = await request(app).get('/api/v1/branches').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
