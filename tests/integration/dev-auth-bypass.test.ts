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

// ─── R3.AC1: Dev mode allows unauthenticated GET catalog requests ──
describe('R3.AC1: Development auth bypass for GET catalog endpoints', () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env['NODE_ENV'];
  });

  afterEach(() => {
    if (originalNodeEnv !== undefined) {
      process.env['NODE_ENV'] = originalNodeEnv;
    } else {
      delete process.env['NODE_ENV'];
    }
  });

  it('should allow unauthenticated GET /v1/categories in development', async () => {
    process.env['NODE_ENV'] = 'development';

    const res = await request(app).get('/v1/categories');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should allow unauthenticated GET /v1/products in development', async () => {
    process.env['NODE_ENV'] = 'development';

    const res = await request(app).get('/v1/products?tier=base');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should allow unauthenticated GET /v1/packages in development', async () => {
    process.env['NODE_ENV'] = 'development';

    const res = await request(app).get('/v1/packages');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should allow unauthenticated GET /v1/branches in development', async () => {
    process.env['NODE_ENV'] = 'development';

    const res = await request(app).get('/v1/branches');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should allow unauthenticated GET /v1/rotations/snack in development', async () => {
    process.env['NODE_ENV'] = 'development';

    const res = await request(app).get('/v1/rotations/snack');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ─── R3.AC2: Dev mode allows unauthenticated POST pricing requests ─
describe('R3.AC2: Development auth bypass for POST pricing endpoints', () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env['NODE_ENV'];
  });

  afterEach(() => {
    if (originalNodeEnv !== undefined) {
      process.env['NODE_ENV'] = originalNodeEnv;
    } else {
      delete process.env['NODE_ENV'];
    }
  });

  it('should allow unauthenticated POST /v1/pricing/calculate in development', async () => {
    process.env['NODE_ENV'] = 'development';

    // Get a valid package ID first (with auth since we need one)
    const pkgRes = await request(app).get('/v1/packages');
    const packageId = pkgRes.body[0].id;

    const res = await request(app).post('/v1/pricing/calculate').send({ packageId });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalInclVat');
  });
});

// ─── R3.AC3: Non-dev mode rejects unauthenticated requests ─────────
describe('R3.AC3: Production/test mode rejects unauthenticated requests', () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env['NODE_ENV'];
  });

  afterEach(() => {
    if (originalNodeEnv !== undefined) {
      process.env['NODE_ENV'] = originalNodeEnv;
    } else {
      delete process.env['NODE_ENV'];
    }
  });

  it('should reject unauthenticated GET /v1/categories in production', async () => {
    process.env['NODE_ENV'] = 'production';

    const res = await request(app).get('/v1/categories');

    expect(res.status).toBe(401);
  });

  it('should reject unauthenticated GET /v1/products in production', async () => {
    process.env['NODE_ENV'] = 'production';

    const res = await request(app).get('/v1/products?tier=base');

    expect(res.status).toBe(401);
  });

  it('should reject unauthenticated POST /v1/pricing/calculate in production', async () => {
    process.env['NODE_ENV'] = 'production';

    const res = await request(app).post('/v1/pricing/calculate').send({ packageId: 'fake' });

    expect(res.status).toBe(401);
  });

  it('should still allow authenticated requests in production', async () => {
    process.env['NODE_ENV'] = 'production';

    const res = await request(app).get('/v1/categories').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('should NOT bypass auth for non-catalog endpoints (subscriptions)', async () => {
    process.env['NODE_ENV'] = 'development';

    const res = await request(app).get('/v1/subscriptions/active');

    expect(res.status).toBe(401);
  });
});
