import 'dotenv/config';
import { createApp } from './app.js';
import { connectDb, checkDb } from './db/connection.js';
import { logger } from './middleware/logger.middleware.js';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const DATABASE_URL = process.env['DATABASE_URL'];
const VERSION = '0.1.0';

async function main() {
  if (!DATABASE_URL) {
    logger.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const { db } = await connectDb(DATABASE_URL);

  const app = createApp({ checkDb, version: VERSION, db });

  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'FLOD backend started');
  });
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
