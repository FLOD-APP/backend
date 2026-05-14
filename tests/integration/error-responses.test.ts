import request from 'supertest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../../src/db/schema.js';
import { createApp } from '../../src/app.js';

const DATABASE_URL = process.env['DATABASE_URL'] ?? 'postgresql://flod:flod_dev_password@localhost:5433/flod_dev';
const JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long!!';
const JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-chars!!';

let sql: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle<typeof schema>>;
let app: ReturnType<typeof createApp>;

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
});

afterAll(async () => {
  await sql.end();
  delete process.env['JWT_SECRET'];
  delete process.env['JWT_REFRESH_SECRET'];
});

// ─── R5.AC1: 401 response format ──────────────────────────────────
describe('R5.AC1: 401 response for unauthenticated requests', () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
  });

  afterEach(() => {
    if (originalNodeEnv !== undefined) {
      process.env['NODE_ENV'] = originalNodeEnv;
    } else {
      delete process.env['NODE_ENV'];
    }
  });

  it('should return 401 with error message for unauthenticated requests', async () => {
    const res = await request(app).get('/v1/categories');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('code', 'AUTH_REQUIRED');
  });

  it('should return 401 for invalid token', async () => {
    const res = await request(app).get('/v1/categories').set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('code', 'AUTH_INVALID');
  });
});

// ─── R5.AC2: 404 response for missing resources ───────────────────
describe('R5.AC2: 404 response for missing product/package', () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'development';
  });

  afterEach(() => {
    if (originalNodeEnv !== undefined) {
      process.env['NODE_ENV'] = originalNodeEnv;
    } else {
      delete process.env['NODE_ENV'];
    }
  });

  it('should return 404 for non-existent product', async () => {
    const res = await request(app).get('/v1/products/00000000-0000-0000-0000-000000000000');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('should return 404 for non-existent package', async () => {
    const res = await request(app).get('/v1/packages/00000000-0000-0000-0000-000000000000');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

// ─── R5.AC4: Error responses do not expose internal details ────────
describe('R5.AC4: Error responses do not expose internal details', () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'development';
  });

  afterEach(() => {
    if (originalNodeEnv !== undefined) {
      process.env['NODE_ENV'] = originalNodeEnv;
    } else {
      delete process.env['NODE_ENV'];
    }
  });

  it('should not include stack traces in 400 error responses', async () => {
    // Products without tier param triggers 400
    const res = await request(app).get('/v1/products');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('code', 'VALIDATION_ERROR');
    expect(res.body).not.toHaveProperty('stack');
  });

  it('should not include stack traces in 404 error responses', async () => {
    const res = await request(app).get('/v1/products/00000000-0000-0000-0000-000000000000');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(res.body).not.toHaveProperty('stack');
  });
});
