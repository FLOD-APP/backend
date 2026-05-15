import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import type * as schemaTypes from '../db/schema.js';
import { users } from '../db/schema.js';
import { AppError } from '../utils/errors.js';
import type { OnboardingInput } from '../validators/user.validators.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

/** Common SELECT shape for user profile (including onboarding fields) */
const profileColumns = {
  id: users.id,
  phone: users.phone,
  name: users.name,
  email: users.email,
  languagePreference: users.languagePreference,
  onboardingComplete: users.onboardingComplete,
  gender: users.gender,
  dateOfBirth: users.dateOfBirth,
  goal: users.goal,
  activityLevel: users.activityLevel,
  heightCm: users.heightCm,
  weightKg: users.weightKg,
  targetWeightKg: users.targetWeightKg,
  allergies: users.allergies,
  whyReasons: users.whyReasons,
  dailyCalories: users.dailyCalories,
  proteinGrams: users.proteinGrams,
  carbsGrams: users.carbsGrams,
  fatGrams: users.fatGrams,
  createdAt: users.createdAt,
} as const;

export class UserService {
  constructor(private db: Db) {}

  /** R14.AC1 + R1.AC2: Get user profile by ID (includes onboarding fields) */
  async getProfile(userId: string) {
    const rows = await this.db.select(profileColumns).from(users).where(eq(users.id, userId)).limit(1);

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

    const rows = await this.db.update(users).set(setFields).where(eq(users.id, userId)).returning(profileColumns);

    return rows[0]!;
  }

  /** R2.AC2 + R2.AC3 + R2.AC4 + R4.AC2: Save onboarding data */
  async saveOnboarding(userId: string, data: OnboardingInput) {
    // Check user exists
    const existing = await this.db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);

    if (existing.length === 0) {
      throw new AppError('User not found', 'USER_NOT_FOUND', 404);
    }

    const rows = await this.db
      .update(users)
      .set({
        gender: data.gender,
        dateOfBirth: data.dateOfBirth,
        goal: data.goal,
        activityLevel: data.activityLevel,
        heightCm: String(data.heightCm),
        weightKg: String(data.weightKg),
        targetWeightKg: data.targetWeightKg !== undefined ? String(data.targetWeightKg) : null,
        allergies: data.allergies,
        whyReasons: data.whyReasons,
        dailyCalories: data.dailyCalories,
        proteinGrams: String(data.proteinGrams),
        carbsGrams: String(data.carbsGrams),
        fatGrams: String(data.fatGrams),
        onboardingComplete: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning(profileColumns);

    return rows[0]!;
  }
}
