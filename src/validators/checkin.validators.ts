import { z } from 'zod';

export const createCheckInSchema = z.object({
  branchId: z.string().uuid('branchId must be a valid UUID'),
});

export const updateCheckInStatusSchema = z.object({
  status: z.enum(['preparing', 'ready', 'collected'], {
    message: 'status must be "preparing", "ready", or "collected"',
  }),
});
