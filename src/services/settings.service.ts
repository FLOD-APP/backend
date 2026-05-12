import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import type * as schemaTypes from '../db/schema.js';
import { systemSettings } from '../db/schema.js';
import { AppError } from '../utils/errors.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

export class SettingsService {
  constructor(private db: Db) {}

  /** R16.AC1: Get all system settings */
  async getAll() {
    return this.db
      .select({
        key: systemSettings.key,
        value: systemSettings.value,
        description: systemSettings.description,
        updatedAt: systemSettings.updatedAt,
      })
      .from(systemSettings)
      .orderBy(systemSettings.key);
  }

  /** R16.AC2 + R16.AC3: Update a setting by key */
  async update(key: string, value: string, updatedBy?: string) {
    const existing = await this.db
      .select({ key: systemSettings.key })
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);

    if (existing.length === 0) {
      throw new AppError('Setting not found', 'SETTING_NOT_FOUND', 404);
    }

    const rows = await this.db
      .update(systemSettings)
      .set({
        value,
        updatedBy: updatedBy ?? null,
        updatedAt: new Date(),
      })
      .where(eq(systemSettings.key, key))
      .returning({
        key: systemSettings.key,
        value: systemSettings.value,
        description: systemSettings.description,
        updatedAt: systemSettings.updatedAt,
        updatedBy: systemSettings.updatedBy,
      });

    return rows[0]!;
  }
}
