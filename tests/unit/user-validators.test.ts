/// <reference types="jest" />

import { onboardingSchema } from '../../src/validators/user.validators.js';

describe('onboardingSchema', () => {
  const validPayload = {
    goal: 'lose_weight',
    gender: 'male',
    dateOfBirth: '1998-03-15',
    heightCm: 175,
    weightKg: 82,
    targetWeightKg: 72,
    activityLevel: 'moderately_active',
    allergies: ['dairy', 'nuts'],
    dailyCalories: 2104,
    proteinGrams: 158,
    carbsGrams: 210,
    fatGrams: 70,
  };

  // R2.AC5: valid payload passes
  it('R2.AC5: should accept a valid onboarding payload', () => {
    const result = onboardingSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  // R2.AC5: missing required field — goal
  it('R2.AC5: should reject payload missing goal', () => {
    const { goal, ...rest } = validPayload;
    const result = onboardingSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  // R2.AC5: missing required field — gender
  it('R2.AC5: should reject payload missing gender', () => {
    const { gender, ...rest } = validPayload;
    const result = onboardingSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  // R2.AC5: missing required field — dateOfBirth
  it('R2.AC5: should reject payload missing dateOfBirth', () => {
    const { dateOfBirth, ...rest } = validPayload;
    const result = onboardingSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  // R2.AC5: missing required field — heightCm
  it('R2.AC5: should reject payload missing heightCm', () => {
    const { heightCm, ...rest } = validPayload;
    const result = onboardingSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  // R2.AC5: missing required field — weightKg
  it('R2.AC5: should reject payload missing weightKg', () => {
    const { weightKg, ...rest } = validPayload;
    const result = onboardingSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  // R2.AC5: missing required field — activityLevel
  it('R2.AC5: should reject payload missing activityLevel', () => {
    const { activityLevel, ...rest } = validPayload;
    const result = onboardingSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  // NFR1: invalid goal enum value
  it('NFR1: should reject invalid goal value', () => {
    const result = onboardingSchema.safeParse({ ...validPayload, goal: 'fly_to_moon' });
    expect(result.success).toBe(false);
  });

  // NFR1: invalid gender enum value
  it('NFR1: should reject invalid gender value', () => {
    const result = onboardingSchema.safeParse({ ...validPayload, gender: 'other' });
    expect(result.success).toBe(false);
  });

  // NFR1: invalid activityLevel enum value
  it('NFR1: should reject invalid activityLevel value', () => {
    const result = onboardingSchema.safeParse({ ...validPayload, activityLevel: 'super_extreme' });
    expect(result.success).toBe(false);
  });

  // NFR1: heightCm boundary — too low
  it('NFR1: should reject heightCm below 50', () => {
    const result = onboardingSchema.safeParse({ ...validPayload, heightCm: 49 });
    expect(result.success).toBe(false);
  });

  // NFR1: heightCm boundary — too high
  it('NFR1: should reject heightCm above 300', () => {
    const result = onboardingSchema.safeParse({ ...validPayload, heightCm: 301 });
    expect(result.success).toBe(false);
  });

  // NFR1: heightCm boundary — minimum
  it('NFR1: should accept heightCm at 50', () => {
    const result = onboardingSchema.safeParse({ ...validPayload, heightCm: 50 });
    expect(result.success).toBe(true);
  });

  // NFR1: heightCm boundary — maximum
  it('NFR1: should accept heightCm at 300', () => {
    const result = onboardingSchema.safeParse({ ...validPayload, heightCm: 300 });
    expect(result.success).toBe(true);
  });

  // NFR1: weightKg boundary — too low
  it('NFR1: should reject weightKg below 20', () => {
    const result = onboardingSchema.safeParse({ ...validPayload, weightKg: 19 });
    expect(result.success).toBe(false);
  });

  // NFR1: weightKg boundary — too high
  it('NFR1: should reject weightKg above 500', () => {
    const result = onboardingSchema.safeParse({ ...validPayload, weightKg: 501 });
    expect(result.success).toBe(false);
  });

  // Optional fields
  it('should accept payload without targetWeightKg', () => {
    const { targetWeightKg, ...rest } = validPayload;
    const result = onboardingSchema.safeParse(rest);
    expect(result.success).toBe(true);
  });

  it('should accept payload without allergies (defaults to empty)', () => {
    const { allergies, ...rest } = validPayload;
    const result = onboardingSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allergies).toEqual([]);
    }
  });

  // NFR1: invalid allergy value
  it('NFR1: should reject invalid allergy value', () => {
    const result = onboardingSchema.safeParse({ ...validPayload, allergies: ['dairy', 'kryptonite'] });
    expect(result.success).toBe(false);
  });

  // NFR1: dailyCalories must be positive
  it('NFR1: should reject dailyCalories of 0', () => {
    const result = onboardingSchema.safeParse({ ...validPayload, dailyCalories: 0 });
    expect(result.success).toBe(false);
  });

  // NFR1: macros must be positive
  it('NFR1: should reject negative proteinGrams', () => {
    const result = onboardingSchema.safeParse({ ...validPayload, proteinGrams: -1 });
    expect(result.success).toBe(false);
  });
});
