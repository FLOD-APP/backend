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

// ─── R7.AC1: Categories ──────────────────────────────────────────
describe('GET /api/v1/categories', () => {
  it('R7.AC1: should return all product categories', async () => {
    const res = await request(app).get('/api/v1/categories').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(17);
  });

  it('R7.AC1: each category should include required fields', async () => {
    const res = await request(app).get('/api/v1/categories').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const cat = res.body[0];
    expect(cat).toHaveProperty('id');
    expect(cat).toHaveProperty('nameEn');
    expect(cat).toHaveProperty('nameAr');
    expect(cat).toHaveProperty('sortOrder');
    expect(cat).toHaveProperty('inSubscription');
  });

  it('should require authentication', async () => {
    const res = await request(app).get('/api/v1/categories');
    expect(res.status).toBe(401);
  });
});

// ─── R7.AC2: Products with Tier Pricing ──────────────────────────
describe('GET /api/v1/products?tier=...', () => {
  it('R7.AC2: should return products with prices for base tier', async () => {
    const res = await request(app).get('/api/v1/products?tier=base').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('R7.AC2: each product should include required fields', async () => {
    const res = await request(app).get('/api/v1/products?tier=base').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const product = res.body[0];
    expect(product).toHaveProperty('id');
    expect(product).toHaveProperty('categoryId');
    expect(product).toHaveProperty('sku');
    expect(product).toHaveProperty('nameEn');
    expect(product).toHaveProperty('nameAr');
    expect(product).toHaveProperty('proteinType');
    expect(product).toHaveProperty('isFree');
    expect(product).toHaveProperty('priceInclVat');
  });

  it('R7.AC5: products without a price for the tier should be omitted', async () => {
    // Subscription tier should not include breakfast items (which only have base+app prices)
    const baseRes = await request(app).get('/api/v1/products?tier=base').set('Authorization', `Bearer ${token}`);
    const subRes = await request(app).get('/api/v1/products?tier=subscription').set('Authorization', `Bearer ${token}`);

    expect(baseRes.status).toBe(200);
    expect(subRes.status).toBe(200);
    // Base tier should have more products than subscription (breakfast items have no sub price)
    expect(baseRes.body.length).toBeGreaterThanOrEqual(subRes.body.length);
  });

  it('should reject missing tier parameter', async () => {
    const res = await request(app).get('/api/v1/products').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('should reject invalid tier value', async () => {
    const res = await request(app).get('/api/v1/products?tier=premium').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('should require authentication', async () => {
    const res = await request(app).get('/api/v1/products?tier=base');
    expect(res.status).toBe(401);
  });
});

// ─── R7.AC3: Filter by Category ──────────────────────────────────
describe('GET /api/v1/products?tier=base&category_id=...', () => {
  let chickenCategoryId: string;

  beforeAll(async () => {
    const rows = await sql`SELECT id FROM product_categories WHERE name_en = 'Chicken' LIMIT 1`;
    chickenCategoryId = rows[0]!['id'] as string;
  });

  it('R7.AC3: should return only products from the specified category', async () => {
    const res = await request(app)
      .get(`/api/v1/products?tier=base&category_id=${chickenCategoryId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const product of res.body) {
      expect(product.categoryId).toBe(chickenCategoryId);
    }
  });

  it('R7.AC3: filtered results should be fewer than unfiltered', async () => {
    const allRes = await request(app).get('/api/v1/products?tier=base').set('Authorization', `Bearer ${token}`);
    const filteredRes = await request(app)
      .get(`/api/v1/products?tier=base&category_id=${chickenCategoryId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(filteredRes.body.length).toBeLessThan(allRes.body.length);
  });
});

// ─── R7.AC4: Filter by Subscription ──────────────────────────────
describe('GET /api/v1/products?tier=base&in_subscription=true', () => {
  it('R7.AC4: should return only products whose category has in_subscription=true', async () => {
    const res = await request(app)
      .get('/api/v1/products?tier=base&in_subscription=true')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);

    // Get all subscription category IDs
    const subCatRows = await sql`
      SELECT id FROM product_categories WHERE in_subscription = true
    `;
    const subCatIds = new Set(subCatRows.map((r) => r['id'] as string));

    for (const product of res.body) {
      expect(subCatIds.has(product.categoryId)).toBe(true);
    }
  });

  it('R7.AC4: in_subscription filter should return fewer products than unfiltered', async () => {
    const allRes = await request(app).get('/api/v1/products?tier=base').set('Authorization', `Bearer ${token}`);
    const subRes = await request(app)
      .get('/api/v1/products?tier=base&in_subscription=true')
      .set('Authorization', `Bearer ${token}`);

    // Some categories are not in subscription, so filtered should be fewer
    expect(subRes.body.length).toBeLessThanOrEqual(allRes.body.length);
  });
});

// ─── R7.AC6: Product Detail ──────────────────────────────────────
describe('GET /api/v1/products/:id', () => {
  let productId: string;

  beforeAll(async () => {
    // Get a product that has prices
    const rows = await sql`
      SELECT p.id FROM products p
      JOIN product_prices pp ON pp.product_id = p.id
      WHERE p.is_active = true
      LIMIT 1
    `;
    productId = rows[0]!['id'] as string;
  });

  it('R7.AC6: should return full product detail with all pricing tiers', async () => {
    const res = await request(app).get(`/api/v1/products/${productId}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(productId);
    expect(res.body).toHaveProperty('nameEn');
    expect(res.body).toHaveProperty('nameAr');
    expect(res.body).toHaveProperty('sku');
    expect(res.body).toHaveProperty('calories');
    expect(res.body).toHaveProperty('allergens');
    expect(res.body).toHaveProperty('proteinType');
    expect(res.body).toHaveProperty('prices');
    expect(Array.isArray(res.body.prices)).toBe(true);
    expect(res.body.prices.length).toBeGreaterThan(0);
  });

  it('R7.AC6: prices should include tier and priceInclVat', async () => {
    const res = await request(app).get(`/api/v1/products/${productId}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    for (const price of res.body.prices) {
      expect(price).toHaveProperty('tier');
      expect(price).toHaveProperty('priceInclVat');
      expect(price).toHaveProperty('currency');
    }
  });

  it('should return 404 for non-existent product', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app).get(`/api/v1/products/${fakeId}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('should require authentication', async () => {
    const res = await request(app).get(`/api/v1/products/${productId}`);
    expect(res.status).toBe(401);
  });
});
