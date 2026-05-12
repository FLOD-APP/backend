import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import { logger } from '../middleware/logger.middleware.js';

const MAX_RETRIES = 5;
const INITIAL_DELAY_MS = 1000;

type Db = PostgresJsDatabase<typeof schema>;

let sql: ReturnType<typeof postgres> | null = null;
let db: Db | null = null;

export async function connectDb(databaseUrl: string): Promise<{
  sql: ReturnType<typeof postgres>;
  db: Db;
}> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const client = postgres(databaseUrl, {
        max: 20,
        idle_timeout: 20,
        connect_timeout: 10,
      });

      // Test the connection
      await client`SELECT 1`;

      sql = client;
      db = drizzle(client, { schema });

      logger.info({ attempt }, 'Database connected');
      return { sql: client, db };
    } catch (err) {
      const delay = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
      logger.warn(
        { attempt, maxRetries: MAX_RETRIES, nextRetryMs: delay, error: (err as Error).message },
        'Database connection failed, retrying',
      );

      if (attempt === MAX_RETRIES) {
        logger.error('All database connection retries exhausted');
        throw err;
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('Unreachable');
}

export async function checkDb(): Promise<boolean> {
  if (!sql) return false;
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export function getDb(): Db {
  if (!db) throw new Error('Database not initialized. Call connectDb first.');
  return db;
}

export function getSql() {
  if (!sql) throw new Error('Database not initialized. Call connectDb first.');
  return sql;
}

export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = null;
    db = null;
  }
}
