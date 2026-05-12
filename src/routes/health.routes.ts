import { Router } from 'express';
import type { Request, Response } from 'express';

export function healthRoutes(checkDb: () => Promise<boolean>, version: string): Router {
  const router = Router();

  router.get('/health', async (_req: Request, res: Response) => {
    const dbConnected = await checkDb();
    const status = dbConnected ? 'ok' : 'degraded';
    const statusCode = dbConnected ? 200 : 503;

    res.status(statusCode).json({
      status,
      version,
      database: dbConnected ? 'connected' : 'disconnected',
    });
  });

  return router;
}
