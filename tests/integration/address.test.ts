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

const TEST_PHONE = '+966500000090';
const TEST_PHONE_2 = '+966500000091';

let sqlClient: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle<typeof schema>>;
let app: ReturnType<typeof createApp>;
let testUserId: string;
let testUser2Id: string;
let token: string;
let token2: string;

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
});

afterAll(async () => {
  // Cleanup: addresses → users
  await sqlClient`DELETE FROM user_addresses WHERE user_id IN (${testUserId}::uuid, ${testUser2Id}::uuid)`;
  await sqlClient`DELETE FROM users WHERE phone IN (${TEST_PHONE}, ${TEST_PHONE_2})`;
  await sqlClient.end();
  delete process.env['JWT_SECRET'];
  delete process.env['JWT_REFRESH_SECRET'];
});

// Clean addresses before and after each test for isolation
beforeEach(async () => {
  await sqlClient`DELETE FROM user_addresses WHERE user_id IN (${testUserId}::uuid, ${testUser2Id}::uuid)`;
});

afterEach(async () => {
  await sqlClient`DELETE FROM user_addresses WHERE user_id IN (${testUserId}::uuid, ${testUser2Id}::uuid)`;
});

const VALID_ADDRESS = {
  label: 'home',
  streetEn: 'King Fahd Road',
  streetAr: 'طريق الملك فهد',
  districtEn: 'Al Rabie',
  districtAr: 'الربيع',
  cityEn: 'Riyadh',
  cityAr: 'الرياض',
  lat: 24.7136,
  lng: 46.6753,
};

// ─── R6.AC1: Authentication ──────────────────────────────────

describe('R6 — Authentication', () => {
  // R6.AC1: Missing JWT returns 401
  it('should return 401 for GET without token', async () => {
    const res = await request(app).get('/v1/addresses');
    expect(res.status).toBe(401);
  });

  it('should return 401 for POST without token', async () => {
    const res = await request(app).post('/v1/addresses').send(VALID_ADDRESS);
    expect(res.status).toBe(401);
  });

  it('should return 401 for invalid token', async () => {
    const res = await request(app).get('/v1/addresses').set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });
});

// ─── R1: List Addresses ──────────────────────────────────────

describe('R1 — List Addresses', () => {
  // R1.AC3: Empty array when no addresses
  it('should return empty array when user has no addresses', async () => {
    const res = await request(app).get('/v1/addresses').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  // R1.AC1: Returns user's addresses
  it('should return addresses belonging to the user', async () => {
    // Create an address first
    await request(app).post('/v1/addresses').set('Authorization', `Bearer ${token}`).send(VALID_ADDRESS);

    const res = await request(app).get('/v1/addresses').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].label).toBe('home');
  });

  // R1.AC2: Response includes all required fields
  it('should include all required fields in response', async () => {
    await request(app).post('/v1/addresses').set('Authorization', `Bearer ${token}`).send(VALID_ADDRESS);

    const res = await request(app).get('/v1/addresses').set('Authorization', `Bearer ${token}`);
    const addr = res.body.data[0];
    expect(addr).toHaveProperty('id');
    expect(addr).toHaveProperty('label');
    expect(addr).toHaveProperty('streetEn');
    expect(addr).toHaveProperty('streetAr');
    expect(addr).toHaveProperty('districtEn');
    expect(addr).toHaveProperty('districtAr');
    expect(addr).toHaveProperty('cityEn');
    expect(addr).toHaveProperty('cityAr');
    expect(addr).toHaveProperty('postalCode');
    expect(addr).toHaveProperty('lat');
    expect(addr).toHaveProperty('lng');
    expect(addr).toHaveProperty('isDefault');
    expect(addr).toHaveProperty('createdAt');
    // Verify numeric fields are numbers, not strings
    expect(typeof addr.lat).toBe('number');
    expect(typeof addr.lng).toBe('number');
  });

  // R6.AC2: Addresses scoped to authenticated user
  it('should not return addresses belonging to another user', async () => {
    // User 1 creates an address
    await request(app).post('/v1/addresses').set('Authorization', `Bearer ${token}`).send(VALID_ADDRESS);

    // User 2 lists — should see nothing
    const res = await request(app).get('/v1/addresses').set('Authorization', `Bearer ${token2}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

// ─── R2: Create Address ──────────────────────────────────────

describe('R2 — Create Address', () => {
  // R2.AC1: Successful creation
  it('should create an address and return 201', async () => {
    const res = await request(app).post('/v1/addresses').set('Authorization', `Bearer ${token}`).send(VALID_ADDRESS);
    expect(res.status).toBe(201);
    expect(res.body.data.label).toBe('home');
    expect(res.body.data.streetEn).toBe('King Fahd Road');
    expect(res.body.data.lat).toBe(24.7136);
    expect(res.body.data.lng).toBe(46.6753);
  });

  // R2.AC2 + R2.AC4: Validation — invalid label rejected
  it('should reject invalid label with 400', async () => {
    const res = await request(app)
      .post('/v1/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_ADDRESS, label: 'office' });
    expect(res.status).toBe(400);
  });

  // R2.AC2: Validation — missing required fields
  it('should reject request missing required fields', async () => {
    const res = await request(app)
      .post('/v1/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'home' });
    expect(res.status).toBe(400);
  });

  // R2.AC7: First address auto-set as default
  it('should set first address as default', async () => {
    const res = await request(app).post('/v1/addresses').set('Authorization', `Bearer ${token}`).send(VALID_ADDRESS);
    expect(res.status).toBe(201);
    expect(res.body.data.isDefault).toBe(true);
  });

  // R2.AC7: Second address should NOT be default
  it('should not set second address as default', async () => {
    await request(app).post('/v1/addresses').set('Authorization', `Bearer ${token}`).send(VALID_ADDRESS);

    const res = await request(app)
      .post('/v1/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_ADDRESS, label: 'work' });
    expect(res.status).toBe(201);
    expect(res.body.data.isDefault).toBe(false);
  });

  // R2.AC5: Max 2 addresses limit
  it('should reject third address with 409 MAX_ADDRESSES_REACHED', async () => {
    await request(app).post('/v1/addresses').set('Authorization', `Bearer ${token}`).send(VALID_ADDRESS);
    await request(app)
      .post('/v1/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_ADDRESS, label: 'work' });

    const res = await request(app)
      .post('/v1/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_ADDRESS, label: 'home' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('MAX_ADDRESSES_REACHED');
  });

  // R2.AC6: Duplicate label rejected
  it('should reject duplicate label with 409 LABEL_ALREADY_EXISTS', async () => {
    await request(app).post('/v1/addresses').set('Authorization', `Bearer ${token}`).send(VALID_ADDRESS);

    const res = await request(app).post('/v1/addresses').set('Authorization', `Bearer ${token}`).send(VALID_ADDRESS);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LABEL_ALREADY_EXISTS');
  });
});

// ─── R3: Update Address ──────────────────────────────────────

describe('R3 — Update Address', () => {
  // R3.AC1: Partial update
  it('should update provided fields and return full address', async () => {
    const created = await request(app)
      .post('/v1/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_ADDRESS);
    const id = created.body.data.id;

    const res = await request(app)
      .patch(`/v1/addresses/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ streetEn: 'Updated Street' });
    expect(res.status).toBe(200);
    expect(res.body.data.streetEn).toBe('Updated Street');
    // Unchanged fields preserved
    expect(res.body.data.streetAr).toBe('طريق الملك فهد');
    expect(res.body.data.label).toBe('home');
  });

  // R3.AC2: Not found
  it('should return 404 for non-existent address', async () => {
    const res = await request(app)
      .patch('/v1/addresses/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .send({ streetEn: 'Updated' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ADDRESS_NOT_FOUND');
  });

  // R3.AC2: Cannot update another user's address
  it('should return 404 when updating another user address', async () => {
    const created = await request(app)
      .post('/v1/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_ADDRESS);
    const id = created.body.data.id;

    const res = await request(app)
      .patch(`/v1/addresses/${id}`)
      .set('Authorization', `Bearer ${token2}`)
      .send({ streetEn: 'Hacked' });
    expect(res.status).toBe(404);
  });

  // R3.AC3: Label conflict on update
  it('should reject label change that conflicts with existing label', async () => {
    await request(app).post('/v1/addresses').set('Authorization', `Bearer ${token}`).send(VALID_ADDRESS);
    const work = await request(app)
      .post('/v1/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_ADDRESS, label: 'work' });

    const res = await request(app)
      .patch(`/v1/addresses/${work.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'home' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LABEL_ALREADY_EXISTS');
  });
});

// ─── R4: Delete Address ──────────────────────────────────────

describe('R4 — Delete Address', () => {
  // R4.AC1: Successful delete
  it('should delete an address and return 204', async () => {
    const created = await request(app)
      .post('/v1/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_ADDRESS);
    const id = created.body.data.id;

    const res = await request(app).delete(`/v1/addresses/${id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);

    // Verify it's gone
    const list = await request(app).get('/v1/addresses').set('Authorization', `Bearer ${token}`);
    expect(list.body.data).toHaveLength(0);
  });

  // R4.AC2: Not found
  it('should return 404 for non-existent address', async () => {
    const res = await request(app)
      .delete('/v1/addresses/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ADDRESS_NOT_FOUND');
  });

  // R4.AC3: Auto-promote remaining address to default
  it('should promote remaining address to default when default is deleted', async () => {
    // Create two addresses — home (default) + work
    await request(app).post('/v1/addresses').set('Authorization', `Bearer ${token}`).send(VALID_ADDRESS);
    await request(app)
      .post('/v1/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_ADDRESS, label: 'work' });

    // Get IDs
    const list1 = await request(app).get('/v1/addresses').set('Authorization', `Bearer ${token}`);
    const homeAddr = list1.body.data.find((a: { label: string }) => a.label === 'home');
    expect(homeAddr.isDefault).toBe(true);

    // Delete the default (home)
    await request(app).delete(`/v1/addresses/${homeAddr.id}`).set('Authorization', `Bearer ${token}`);

    // Work should now be default
    const list2 = await request(app).get('/v1/addresses').set('Authorization', `Bearer ${token}`);
    expect(list2.body.data).toHaveLength(1);
    expect(list2.body.data[0].label).toBe('work');
    expect(list2.body.data[0].isDefault).toBe(true);
  });
});

// ─── R5: Set Default ─────────────────────────────────────────

describe('R5 — Set Default', () => {
  // R5.AC1 + R5.AC2: Toggle default
  it('should set address as default and unset previous default', async () => {
    // Create two addresses
    await request(app).post('/v1/addresses').set('Authorization', `Bearer ${token}`).send(VALID_ADDRESS);
    await request(app)
      .post('/v1/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_ADDRESS, label: 'work' });

    const list1 = await request(app).get('/v1/addresses').set('Authorization', `Bearer ${token}`);
    const workAddr = list1.body.data.find((a: { label: string }) => a.label === 'work');
    expect(workAddr.isDefault).toBe(false);

    // Set work as default
    const res = await request(app)
      .patch(`/v1/addresses/${workAddr.id}/default`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isDefault).toBe(true);

    // Verify home is no longer default
    const list2 = await request(app).get('/v1/addresses').set('Authorization', `Bearer ${token}`);
    const homeAddr = list2.body.data.find((a: { label: string }) => a.label === 'home');
    expect(homeAddr.isDefault).toBe(false);
  });

  // R5.AC3: Not found
  it('should return 404 for non-existent address', async () => {
    const res = await request(app)
      .patch('/v1/addresses/00000000-0000-0000-0000-000000000000/default')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ADDRESS_NOT_FOUND');
  });
});
