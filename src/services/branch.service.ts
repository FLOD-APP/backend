import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and } from 'drizzle-orm';
import type * as schemaTypes from '../db/schema.js';
import { branches } from '../db/schema.js';
import { AppError } from '../utils/errors.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

const BRANCH_FIELDS = {
  id: branches.id,
  foodicsRef: branches.foodicsRef,
  nameEn: branches.nameEn,
  nameAr: branches.nameAr,
  type: branches.type,
  expressClassification: branches.expressClassification,
  latitude: branches.latitude,
  longitude: branches.longitude,
  openHour: branches.openHour,
  closeHour: branches.closeHour,
  isStage0: branches.isStage0,
} as const;

export class BranchService {
  constructor(private db: Db) {}

  /** R6.AC1 + R6.AC2: List active branches, optionally filtered by stage0 */
  async list(
    filters: { stage0?: boolean } = {},
  ): Promise<typeof BRANCH_FIELDS extends infer F ? Record<string, unknown>[] : never> {
    const conditions = [eq(branches.isActive, true)];

    if (filters.stage0) {
      conditions.push(eq(branches.isStage0, true));
    }

    return this.db
      .select(BRANCH_FIELDS)
      .from(branches)
      .where(and(...conditions));
  }

  /** R6.AC3 + R6.AC4: Get a single branch by ID */
  async getById(id: string) {
    const rows = await this.db
      .select(BRANCH_FIELDS)
      .from(branches)
      .where(and(eq(branches.id, id), eq(branches.isActive, true)))
      .limit(1);

    if (rows.length === 0) {
      throw new AppError('Branch not found', 'BRANCH_NOT_FOUND', 404);
    }

    return rows[0]!;
  }
}
