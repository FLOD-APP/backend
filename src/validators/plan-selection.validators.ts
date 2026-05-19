import { z } from 'zod';

/**
 * JSONB add-ons sub-schema.
 *
 * Shape:
 * {
 *   snackIncluded: boolean,
 *   juice: { "1": { "<product-uuid>": 2 }, ... },
 *   soup:  { "2": { "<product-uuid>": 1 }, ... }
 * }
 */
const dayItemMapSchema = z.record(
  z.string().regex(/^\d+$/, 'day key must be a positive integer string'),
  z.record(
    z.string().uuid('product ID must be a valid UUID'),
    z.number().int().positive('quantity must be a positive integer'),
  ),
);

const addOnsSchema = z
  .object({
    snackIncluded: z.boolean().default(false),
    juice: dayItemMapSchema.default({}),
    soup: dayItemMapSchema.default({}),
  })
  .default({ snackIncluded: false, juice: {}, soup: {} });

export const createPlanSelectionSchema = z.object({
  packageId: z.string().uuid('packageId must be a valid UUID'),
  duration: z.union([z.literal(12), z.literal(18), z.literal(24)], {
    message: 'duration must be 12, 18, or 24',
  }),
  mealsPerDay: z.union([z.literal(1), z.literal(2), z.literal(3)], {
    message: 'mealsPerDay must be 1, 2, or 3',
  }),
  branchId: z.string().uuid('branchId must be a valid UUID').optional(),
  fulfilment: z
    .enum(['pickup', 'delivery'], {
      message: 'fulfilment must be "pickup" or "delivery"',
    })
    .default('pickup'),
  deliveryAddressId: z.string().uuid('deliveryAddressId must be a valid UUID').optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD')
    .optional(),
  slot: z
    .enum(['morning', 'evening'], {
      message: 'slot must be "morning" or "evening"',
    })
    .default('morning'),
  addOns: addOnsSchema,
});

export type CreatePlanSelectionInput = z.infer<typeof createPlanSelectionSchema>;

// Update uses the same schema — full replace semantics
export const updatePlanSelectionSchema = createPlanSelectionSchema;

export type UpdatePlanSelectionInput = z.infer<typeof updatePlanSelectionSchema>;
