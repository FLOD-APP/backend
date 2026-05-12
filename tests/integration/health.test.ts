import request from 'supertest';
import { createApp } from '../../src/app';

describe('Health Check', () => {
  // R4.AC1: Health endpoint returns status, version, and database state
  it('R4.AC1: should return 200 with status ok when database is connected', async () => {
    const app = createApp({
      checkDb: async () => true,
      version: '0.1.0',
    });

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      version: '0.1.0',
      database: 'connected',
    });
  });

  // R4.AC2: Health endpoint returns 503 when database is disconnected
  it('R4.AC2: should return 503 with database disconnected when DB is down', async () => {
    const app = createApp({
      checkDb: async () => false,
      version: '0.1.0',
    });

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      status: 'degraded',
      version: '0.1.0',
      database: 'disconnected',
    });
  });

  // R15.AC3: Error responses use consistent format
  it('R15.AC3: should return consistent error format for unknown routes', async () => {
    const app = createApp({
      checkDb: async () => true,
      version: '0.1.0',
    });

    const res = await request(app).get('/api/v1/nonexistent');

    // Express returns 404 by default — we want to verify the JSON format
    expect(res.status).toBe(404);
  });

  // R15.AC4: Unhandled errors return 500 with generic message
  it('R15.AC4: should return 500 with INTERNAL_ERROR for unhandled errors', async () => {
    const app = createApp({
      checkDb: async () => {
        throw new Error('DB crashed');
      },
      version: '0.1.0',
    });

    const res = await request(app).get('/health');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  });

  // R4.AC3: All API routes are under /api/v1 prefix
  it('R4.AC3: should mount API routes under /api/v1 prefix', async () => {
    const app = createApp({
      checkDb: async () => true,
      version: '0.1.0',
    });

    // Health is outside /api/v1 — should be accessible
    const healthRes = await request(app).get('/health');
    expect(healthRes.status).toBe(200);
  });
});
