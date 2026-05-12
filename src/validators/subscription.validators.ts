import { z } from 'zod';

export const createSubscriptionSchema = z.object({
  packageId: z.string().uuid('packageId must be a valid UUID'),
  branchId: z.string().uuid('branchId must be a valid UUID'),
  fulfilmentMode: z.enum(['pickup', 'delivery'], {
    message: 'fulfilmentMode must be "pickup" or "delivery"',
  }),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
  paymentId: z.string().min(1, 'paymentId is required'),
  promoCode: z.string().optional(),
});

export const pauseSubscriptionSchema = z.object({
  pauseStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'pauseStart must be YYYY-MM-DD'),
  pauseEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'pauseEnd must be YYYY-MM-DD'),
});

export const collectMealSchema = z.object({
  dayNumber: z.number().int().positive('dayNumber must be a positive integer'),
  mealSlot: z.number().int().positive('mealSlot must be a positive integer'),
});

export const swapMealSchema = z.object({
  dayNumber: z.number().int().positive('dayNumber must be a positive integer'),
  mealSlot: z.number().int().positive('mealSlot must be a positive integer'),
  newProductId: z.string().uuid('newProductId must be a valid UUID'),
});
