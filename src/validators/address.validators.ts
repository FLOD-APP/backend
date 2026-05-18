import { z } from 'zod';

export const addressLabelEnum = z.enum(['home', 'work']);

export const createAddressSchema = z.object({
  label: addressLabelEnum,
  streetEn: z.string().min(1).max(200),
  streetAr: z.string().min(1).max(200),
  districtEn: z.string().min(1).max(200),
  districtAr: z.string().min(1).max(200),
  cityEn: z.string().min(1).max(100),
  cityAr: z.string().min(1).max(100),
  postalCode: z.string().max(20).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export type CreateAddressInput = z.infer<typeof createAddressSchema>;

export const updateAddressSchema = z
  .object({
    label: addressLabelEnum.optional(),
    streetEn: z.string().min(1).max(200).optional(),
    streetAr: z.string().min(1).max(200).optional(),
    districtEn: z.string().min(1).max(200).optional(),
    districtAr: z.string().min(1).max(200).optional(),
    cityEn: z.string().min(1).max(100).optional(),
    cityAr: z.string().min(1).max(100).optional(),
    postalCode: z.string().max(20).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
