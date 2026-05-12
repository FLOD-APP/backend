import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import type * as schemaTypes from '../db/schema.js';
import { users } from '../db/schema.js';
import { AppError } from '../utils/errors.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

export class UserService {
  constructor(private db: Db) {}

  /** R14.AC1: Get user profile by ID */
  async getProfile(userId: string) {
    const rows = await this.db
      .select({
        id: users.id,
        phone: users.phone,
        name: users.name,
        email: users.email,
        languagePreference: users.languagePreference,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (rows.length === 0) {
      throw new AppError('User not found', 'USER_NOT_FOUND', 404);
    }

    return rows[0]!;
  }

  /** R14.AC2 + R14.AC3: Update user profile */
  async updateProfile(userId: string, updates: { name?: string; email?: string; languagePreference?: string }) {
    // R14.AC3: Validate email format if provided
    if (updates.email !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(updates.email)) {
        throw new AppError('Invalid email format', 'VALIDATION_ERROR', 400);
      }
    }

    // Check user exists
    const existing = await this.db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);

    if (existing.length === 0) {
      throw new AppError('User not found', 'USER_NOT_FOUND', 404);
    }

    const setFields: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.name !== undefined) setFields['name'] = updates.name;
    if (updates.email !== undefined) setFields['email'] = updates.email;
    if (updates.languagePreference !== undefined) setFields['languagePreference'] = updates.languagePreference;

    const rows = await this.db.update(users).set(setFields).where(eq(users.id, userId)).returning({
      id: users.id,
      phone: users.phone,
      name: users.name,
      email: users.email,
      languagePreference: users.languagePreference,
      createdAt: users.createdAt,
    });

    return rows[0]!;
  }
}
