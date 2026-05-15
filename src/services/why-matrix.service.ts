import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import type * as schemaTypes from '../db/schema.js';
import { goalWhyMatrix } from '../db/schema.js';
import { AppError } from '../utils/errors.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

export class WhyMatrixService {
  constructor(private db: Db) {}

  /** R2.AC1: Returns { top, locked } for a given goal. R2.AC2: Throws if goal not found. */
  async getForGoal(goal: string): Promise<{ top: string[]; locked: string[] }> {
    const rows = await this.db
      .select({
        topReasons: goalWhyMatrix.topReasons,
        lockedReasons: goalWhyMatrix.lockedReasons,
      })
      .from(goalWhyMatrix)
      .where(eq(goalWhyMatrix.goal, goal))
      .limit(1);

    if (rows.length === 0) {
      throw new AppError('Invalid or unrecognised goal', 'INVALID_GOAL', 400);
    }

    const row = rows[0]!;
    return {
      top: row.topReasons as string[],
      locked: row.lockedReasons as string[],
    };
  }
}
