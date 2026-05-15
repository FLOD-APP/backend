import { z } from 'zod';

export const goalEnum = z.enum(['eat_healthy', 'lose_weight', 'gain_weight', 'build_muscle', 'maintain_weight']);
const genderEnum = z.enum(['male', 'female']);
const activityLevelEnum = z.enum(['sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extra_active']);
const allergyEnum = z.enum(['gluten', 'dairy', 'nuts', 'eggs', 'soy', 'fish', 'shellfish', 'sesame', 'peanuts']);
const whyReasonEnum = z.enum(['lose_weight', 'build_muscle', 'eat_healthier', 'save_time', 'track_calories']);

export const onboardingSchema = z.object({
  goal: goalEnum,
  gender: genderEnum,
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateOfBirth must be YYYY-MM-DD format'),
  heightCm: z.number().min(50).max(300),
  weightKg: z.number().min(20).max(500),
  targetWeightKg: z.number().min(20).max(500).optional(),
  activityLevel: activityLevelEnum,
  allergies: z.array(allergyEnum).default([]),
  whyReasons: z.array(whyReasonEnum).default([]),
  dailyCalories: z.number().int().positive(),
  proteinGrams: z.number().positive(),
  carbsGrams: z.number().positive(),
  fatGrams: z.number().positive(),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const whyMatrixQuerySchema = z.object({
  goal: goalEnum,
});
