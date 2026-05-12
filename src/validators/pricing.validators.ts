import { z } from 'zod';

export const calculatePricingSchema = z.object({
  packageId: z.string().uuid('packageId must be a valid UUID'),
  promoCode: z.string().optional(),
});

export const validatePromoSchema = z.object({
  code: z.string().min(1, 'code is required'),
});
