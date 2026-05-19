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

const TEST_PHONE = '+966500000095';
const TEST_PHONE_2 = '+966500000096';

let sqlClient: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle<typeof schema>>;
let app: ReturnType<typeof createApp>;
let testUserId: string;
let testUser2Id: string;
let token: string;
let token2: string;
let activePackageId: string;
let activeProductId1: string;
let activeProductId2: string;
let inactiveProductId: string;

beforeAll(async () => {
  process.env['JWT_SECRET'] = JWT_SECRET;
  process.env['JWT_REFRESH_SECRET'] = JWT_REFRESH_SECRET;

  sqlClient = postgres(DATABASE_URL, { max: 2 });
  db = drizzle(sqlClient, { schema });

  app = createApp({
    checkDb: async () => true,
    version: '0.1.0-test',
    db,
  });

  // Create test users
  const userRows = await sqlClient`
    INSERT INTO users (phone) VALUES (${TEST_PHONE})
    ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
    RETURNING id
  `;
  testUserId = userRows[0]!['id'] as string;
  token = signAccessToken({ userId: testUserId, phone: TEST_PHONE });

  const user2Rows = await sqlClient`
    INSERT INTO users (phone) VALUES (${TEST_PHONE_2})
    ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
    RETURNING id
  `;
  testUser2Id = user2Rows[0]!['id'] as string;
  token2 = signAccessToken({ userId: testUser2Id, phone: TEST_PHONE_2 });

  // Get an active package for FK validation
  const pkgRows = await sqlClient`SELECT id FROM packages WHERE is_active = true LIMIT 1`;
  activePackageId = pkgRows[0]!['id'] as string;

  // Get two active products for add-on tests
  const prodRows = await sqlClient`SELECT id FROM products WHERE is_active = true LIMIT 2`;
  activeProductId1 = prodRows[0]!['id'] as string;
  activeProductId2 = prodRows[1]!['id'] as string;

  // Create an inactive product for validation tests
  const inactiveProdRows = await sqlClient`
    INSERT INTO products (name_en, name_ar, is_active, category_id)
    SELECT 'Inactive Test Juice', 'عصير تجريبي', false, id
    FROM product_categories LIMIT 1
    RETURNING id
  `;
  inactiveProductId = inactiveProdRows[0]!['id'] as string;
});

afterAll(async () => {
  // Cleanup: plan_selections → products (inactive test) → users
  await sqlClient`DELETE FROM plan_selections WHERE user_id IN (${testUserId}::uuid, ${testUser2Id}::uuid)`;
  await sqlClient`DELETE FROM products WHERE id = ${inactiveProductId}::uuid`;
  await sqlClient`DELETE FROM users WHERE phone IN (${TEST_PHONE}, ${TEST_PHONE_2})`;
  await sqlClient.end();
  delete process.env['JWT_SECRET'];
  delete process.env['JWT_REFRESH_SECRET'];
});

// Clean plan_selections before and after each test for isolation
beforeEach(async () => {
  await sqlClient`DELETE FROM plan_selections WHERE user_id IN (${testUserId}::uuid, ${testUser2Id}::uuid)`;
});

afterEach(async () => {
  await sqlClient`DELETE FROM plan_selections WHERE user_id IN (${testUserId}::uuid, ${testUser2Id}::uuid)`;
});

const VALID_PAYLOAD = () => ({
  packageId: activePackageId,
  duration: 12,
  mealsPerDay: 2,
  fulfilment: 'pickup',
  slot: 'morning',
  addOns: {
    snackIncluded: true,
    juice: {},
    soup: {},
  },
});

// ─── Authentication ─────────────────────────────────────────

describe('Authentication', () => {
  // R1.AC6: All endpoints require auth
  it('should return 401 for POST without token', async () => {
    const res = await request(app).post('/v1/plan-selections').send(VALID_PAYLOAD());
    expect(res.status).toBe(401);
  });

  it('should return 401 for GET /me without token', async () => {
    const res = await request(app).get('/v1/plan-selections/me');
    expect(res.status).toBe(401);
  });

  it('should return 401 for PUT /me without token', async () => {
    const res = await request(app).put('/v1/plan-selections/me').send(VALID_PAYLOAD());
    expect(res.status).toBe(401);
  });

  it('should return 401 for DELETE /me without token', async () => {
    const res = await request(app).delete('/v1/plan-selections/me');
    expect(res.status).toBe(401);
  });

  it('should return 401 for invalid token', async () => {
    const res = await request(app).get('/v1/plan-selections/me').set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });
});

// ─── R1: Create Plan Selection (POST /) ─────────────────────

describe('R1 — Create Plan Selection', () => {
  // R1.AC1: Persist plan selection on "Start this plan"
  it('should create a plan selection and return 201', async () => {
    const payload = VALID_PAYLOAD();
    const res = await request(app).post('/v1/plan-selections').set('Authorization', `Bearer ${token}`).send(payload);
    expect(res.status).toBe(201);
    expect(res.body.data.packageId).toBe(activePackageId);
    expect(res.body.data.duration).toBe(12);
    expect(res.body.data.mealsPerDay).toBe(2);
  });

  // R1.AC2: Snack add-on stored as boolean
  it('should store snackIncluded as boolean', async () => {
    const payload = { ...VALID_PAYLOAD(), addOns: { snackIncluded: true, juice: {}, soup: {} } };
    const res = await request(app).post('/v1/plan-selections').set('Authorization', `Bearer ${token}`).send(payload);
    expect(res.status).toBe(201);
    expect(res.body.data.addOns.snackIncluded).toBe(true);
  });

  // R1.AC3: Juice stored as per-day item-quantity map
  it('should store juice as per-day product-quantity map', async () => {
    const juiceMap = { '1': { [activeProductId1]: 2 }, '2': { [activeProductId1]: 3 } };
    const payload = { ...VALID_PAYLOAD(), addOns: { snackIncluded: false, juice: juiceMap, soup: {} } };
    const res = await request(app).post('/v1/plan-selections').set('Authorization', `Bearer ${token}`).send(payload);
    expect(res.status).toBe(201);
    expect(res.body.data.addOns.juice).toEqual(juiceMap);
  });

  // R1.AC4: Soup stored in same format as juice
  it('should store soup in same per-day format as juice', async () => {
    const soupMap = { '1': { [activeProductId2]: 1 } };
    const payload = { ...VALID_PAYLOAD(), addOns: { snackIncluded: false, juice: {}, soup: soupMap } };
    const res = await request(app).post('/v1/plan-selections').set('Authorization', `Bearer ${token}`).send(payload);
    expect(res.status).toBe(201);
    expect(res.body.data.addOns.soup).toEqual(soupMap);
  });

  // R1.AC5: Returns persisted record with server-generated ID
  it('should return the persisted record with a server-generated ID', async () => {
    const res = await request(app)
      .post('/v1/plan-selections')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_PAYLOAD());
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.data).toHaveProperty('createdAt');
    expect(res.body.data).toHaveProperty('updatedAt');
  });

  // R1.AC6: Record associated with authenticated user
  it('should associate the selection with the authenticated user', async () => {
    const res = await request(app)
      .post('/v1/plan-selections')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_PAYLOAD());
    expect(res.status).toBe(201);
    expect(res.body.data.userId).toBe(testUserId);
  });

  // R1.AC7: Missing packageId returns 400
  it('should return 400 when packageId is missing', async () => {
    const { packageId: _, ...incomplete } = VALID_PAYLOAD();
    const res = await request(app).post('/v1/plan-selections').set('Authorization', `Bearer ${token}`).send(incomplete);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  // R1.AC7: Missing duration returns 400
  it('should return 400 when duration is missing', async () => {
    const { duration: _, ...incomplete } = VALID_PAYLOAD();
    const res = await request(app).post('/v1/plan-selections').set('Authorization', `Bearer ${token}`).send(incomplete);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  // R1.AC7: Missing mealsPerDay returns 400
  it('should return 400 when mealsPerDay is missing', async () => {
    const { mealsPerDay: _, ...incomplete } = VALID_PAYLOAD();
    const res = await request(app).post('/v1/plan-selections').set('Authorization', `Bearer ${token}`).send(incomplete);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  // NFR2: Invalid duration value rejected by Zod
  it('should return 400 for invalid duration value', async () => {
    const res = await request(app)
      .post('/v1/plan-selections')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_PAYLOAD(), duration: 30 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  // NFR2: Invalid mealsPerDay value rejected by Zod
  it('should return 400 for invalid mealsPerDay value', async () => {
    const res = await request(app)
      .post('/v1/plan-selections')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_PAYLOAD(), mealsPerDay: 5 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  // Defaults applied correctly
  it('should apply default values for optional fields', async () => {
    const res = await request(app)
      .post('/v1/plan-selections')
      .set('Authorization', `Bearer ${token}`)
      .send({ packageId: activePackageId, duration: 12, mealsPerDay: 1 });
    expect(res.status).toBe(201);
    expect(res.body.data.fulfilment).toBe('pickup');
    expect(res.body.data.slot).toBe('morning');
    expect(res.body.data.addOns).toEqual({ snackIncluded: false, juice: {}, soup: {} });
  });

  // Package validation: inactive/non-existent package rejected
  it('should return 400 for non-existent package ID', async () => {
    const res = await request(app)
      .post('/v1/plan-selections')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_PAYLOAD(), packageId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PACKAGE_NOT_FOUND');
  });
});

// ─── R2: Read Plan Selection (GET /me) ──────────────────────

describe('R2 — Read Plan Selection', () => {
  // R2.AC1: Returns current plan selection with all add-on data
  it('should return the user plan selection with all fields', async () => {
    // Create first
    const juiceMap = { '1': { [activeProductId1]: 2 } };
    await request(app)
      .post('/v1/plan-selections')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_PAYLOAD(), addOns: { snackIncluded: true, juice: juiceMap, soup: {} } });

    // Read back
    const res = await request(app).get('/v1/plan-selections/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.packageId).toBe(activePackageId);
    expect(res.body.data.duration).toBe(12);
    expect(res.body.data.mealsPerDay).toBe(2);
    expect(res.body.data.addOns.snackIncluded).toBe(true);
    expect(res.body.data.addOns.juice).toEqual(juiceMap);
  });

  // R2.AC2: 404 when no selection exists
  it('should return 404 when no plan selection exists', async () => {
    const res = await request(app).get('/v1/plan-selections/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PLAN_SELECTION_NOT_FOUND');
  });

  // Scoped to authenticated user
  it('should not return another user plan selection', async () => {
    // User 1 creates a selection
    await request(app).post('/v1/plan-selections').set('Authorization', `Bearer ${token}`).send(VALID_PAYLOAD());

    // User 2 reads — should get 404
    const res = await request(app).get('/v1/plan-selections/me').set('Authorization', `Bearer ${token2}`);
    expect(res.status).toBe(404);
  });
});

// ─── R3: Update Plan Selection (PUT /me) ────────────────────

describe('R3 — Update Plan Selection', () => {
  // R3.AC1: Full replace update overwrites all fields
  it('should overwrite all fields with new values', async () => {
    // Create
    await request(app).post('/v1/plan-selections').set('Authorization', `Bearer ${token}`).send(VALID_PAYLOAD());

    // Update with different values
    const updatedPayload = {
      ...VALID_PAYLOAD(),
      duration: 24,
      mealsPerDay: 3,
      fulfilment: 'delivery',
      slot: 'evening',
      addOns: { snackIncluded: false, juice: { '1': { [activeProductId1]: 5 } }, soup: {} },
    };
    const res = await request(app)
      .put('/v1/plan-selections/me')
      .set('Authorization', `Bearer ${token}`)
      .send(updatedPayload);
    expect(res.status).toBe(200);
    expect(res.body.data.duration).toBe(24);
    expect(res.body.data.mealsPerDay).toBe(3);
    expect(res.body.data.fulfilment).toBe('delivery');
    expect(res.body.data.slot).toBe('evening');
    expect(res.body.data.addOns.snackIncluded).toBe(false);
    expect(res.body.data.addOns.juice).toEqual({ '1': { [activeProductId1]: 5 } });
  });

  // R3.AC2: Returns updated record
  it('should return the updated record with new values', async () => {
    await request(app).post('/v1/plan-selections').set('Authorization', `Bearer ${token}`).send(VALID_PAYLOAD());

    const res = await request(app)
      .put('/v1/plan-selections/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_PAYLOAD(), duration: 18 });
    expect(res.status).toBe(200);
    expect(res.body.data.duration).toBe(18);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data).toHaveProperty('updatedAt');
  });

  // R3.AC3: 404 when no selection to update
  it('should return 404 when no selection exists', async () => {
    const res = await request(app)
      .put('/v1/plan-selections/me')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_PAYLOAD());
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PLAN_SELECTION_NOT_FOUND');
  });

  // R3.AC4: Validation error on invalid body
  it('should return 400 for invalid update body', async () => {
    await request(app).post('/v1/plan-selections').set('Authorization', `Bearer ${token}`).send(VALID_PAYLOAD());

    const res = await request(app)
      .put('/v1/plan-selections/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ duration: 12 }); // missing packageId, mealsPerDay
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

// ─── R4: Delete Plan Selection (DELETE /me) ─────────────────

describe('R4 — Delete Plan Selection', () => {
  // R4.AC2: Delete existing selection
  it('should delete the plan selection and return 204', async () => {
    // Create
    await request(app).post('/v1/plan-selections').set('Authorization', `Bearer ${token}`).send(VALID_PAYLOAD());

    // Delete
    const res = await request(app).delete('/v1/plan-selections/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);

    // Confirm gone
    const getRes = await request(app).get('/v1/plan-selections/me').set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(404);
  });

  // R4.AC3: Idempotent — no error if nothing to delete
  it('should return 204 even when no selection exists (idempotent)', async () => {
    const res = await request(app).delete('/v1/plan-selections/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });
});

// ─── R5: One Selection Per User (Upsert) ────────────────────

describe('R5 — One Selection Per User', () => {
  // R5.AC1: UNIQUE constraint enforced
  it('should have at most one selection per user', async () => {
    await request(app).post('/v1/plan-selections').set('Authorization', `Bearer ${token}`).send(VALID_PAYLOAD());

    // Second POST should upsert, not create a second row
    await request(app)
      .post('/v1/plan-selections')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_PAYLOAD(), duration: 24 });

    // Verify only one row exists via GET
    const res = await request(app).get('/v1/plan-selections/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.duration).toBe(24); // latest value
  });

  // R5.AC2: Upsert replaces existing selection
  it('should replace existing selection on re-POST (upsert)', async () => {
    const first = await request(app)
      .post('/v1/plan-selections')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_PAYLOAD(), mealsPerDay: 1 });
    expect(first.status).toBe(201);
    const firstId = first.body.data.id;

    const second = await request(app)
      .post('/v1/plan-selections')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_PAYLOAD(), mealsPerDay: 3, duration: 18 });
    expect(second.status).toBe(201);

    // GET should return the second values
    const res = await request(app).get('/v1/plan-selections/me').set('Authorization', `Bearer ${token}`);
    expect(res.body.data.mealsPerDay).toBe(3);
    expect(res.body.data.duration).toBe(18);
    // Same user row — ID may or may not change depending on upsert, but only one row
  });

  // Two different users can each have one selection
  it('should allow different users to have their own selections', async () => {
    await request(app)
      .post('/v1/plan-selections')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_PAYLOAD(), mealsPerDay: 1 });

    await request(app)
      .post('/v1/plan-selections')
      .set('Authorization', `Bearer ${token2}`)
      .send({ ...VALID_PAYLOAD(), mealsPerDay: 3 });

    const res1 = await request(app).get('/v1/plan-selections/me').set('Authorization', `Bearer ${token}`);
    expect(res1.body.data.mealsPerDay).toBe(1);

    const res2 = await request(app).get('/v1/plan-selections/me').set('Authorization', `Bearer ${token2}`);
    expect(res2.body.data.mealsPerDay).toBe(3);
  });
});

// ─── R6: Add-On Validation ──────────────────────────────────

describe('R6 — Add-On Validation', () => {
  // R6.AC1: Accepts explicitly provided per-day item maps
  it('should accept valid juice and soup product IDs', async () => {
    const payload = {
      ...VALID_PAYLOAD(),
      addOns: {
        snackIncluded: false,
        juice: { '1': { [activeProductId1]: 2 }, '2': { [activeProductId2]: 1 } },
        soup: { '1': { [activeProductId1]: 1 } },
      },
    };
    const res = await request(app).post('/v1/plan-selections').set('Authorization', `Bearer ${token}`).send(payload);
    expect(res.status).toBe(201);
    expect(res.body.data.addOns.juice['1'][activeProductId1]).toBe(2);
    expect(res.body.data.addOns.soup['1'][activeProductId1]).toBe(1);
  });

  // R6.AC2 + R6.AC3: Non-existent product ID returns 400
  it('should return 400 for non-existent product ID in juice', async () => {
    const payload = {
      ...VALID_PAYLOAD(),
      addOns: {
        snackIncluded: false,
        juice: { '1': { '00000000-0000-0000-0000-000000000000': 1 } },
        soup: {},
      },
    };
    const res = await request(app).post('/v1/plan-selections').set('Authorization', `Bearer ${token}`).send(payload);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ADDON_PRODUCT');
  });

  // R6.AC3: Inactive product ID returns 400
  it('should return 400 for inactive product ID in soup', async () => {
    const payload = {
      ...VALID_PAYLOAD(),
      addOns: {
        snackIncluded: false,
        juice: {},
        soup: { '1': { [inactiveProductId]: 1 } },
      },
    };
    const res = await request(app).post('/v1/plan-selections').set('Authorization', `Bearer ${token}`).send(payload);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ADDON_PRODUCT');
  });

  // R6.AC3: Inactive product in juice also rejected
  it('should return 400 for inactive product ID in juice', async () => {
    const payload = {
      ...VALID_PAYLOAD(),
      addOns: {
        snackIncluded: false,
        juice: { '1': { [inactiveProductId]: 2 } },
        soup: {},
      },
    };
    const res = await request(app).post('/v1/plan-selections').set('Authorization', `Bearer ${token}`).send(payload);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ADDON_PRODUCT');
  });

  // Zod validation: invalid day key format
  it('should return 400 for non-numeric day key', async () => {
    const payload = {
      ...VALID_PAYLOAD(),
      addOns: {
        snackIncluded: false,
        juice: { abc: { [activeProductId1]: 1 } },
        soup: {},
      },
    };
    const res = await request(app).post('/v1/plan-selections').set('Authorization', `Bearer ${token}`).send(payload);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  // Zod validation: invalid product UUID format
  it('should return 400 for non-UUID product key', async () => {
    const payload = {
      ...VALID_PAYLOAD(),
      addOns: {
        snackIncluded: false,
        juice: { '1': { 'not-a-uuid': 1 } },
        soup: {},
      },
    };
    const res = await request(app).post('/v1/plan-selections').set('Authorization', `Bearer ${token}`).send(payload);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  // Zod validation: zero/negative quantity rejected
  it('should return 400 for zero quantity in add-on', async () => {
    const payload = {
      ...VALID_PAYLOAD(),
      addOns: {
        snackIncluded: false,
        juice: { '1': { [activeProductId1]: 0 } },
        soup: {},
      },
    };
    const res = await request(app).post('/v1/plan-selections').set('Authorization', `Bearer ${token}`).send(payload);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  // Product validation also runs on PUT (update)
  it('should validate product IDs on update too', async () => {
    // Create valid selection first
    await request(app).post('/v1/plan-selections').set('Authorization', `Bearer ${token}`).send(VALID_PAYLOAD());

    // Update with invalid product
    const res = await request(app)
      .put('/v1/plan-selections/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...VALID_PAYLOAD(),
        addOns: {
          snackIncluded: false,
          juice: { '1': { '00000000-0000-0000-0000-000000000000': 1 } },
          soup: {},
        },
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ADDON_PRODUCT');
  });
});

// ─── Legacy mount (/api/v1) ─────────────────────────────────

describe('Legacy /api/v1 mount', () => {
  it('should work on /api/v1 prefix as well', async () => {
    const res = await request(app)
      .post('/api/v1/plan-selections')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_PAYLOAD());
    expect(res.status).toBe(201);
    expect(res.body.data.packageId).toBe(activePackageId);
  });
});
