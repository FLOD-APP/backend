import { z } from 'zod';

/** Saudi phone: +966 followed by exactly 9 digits */
const saudiPhone = z.string().regex(/^\+966\d{9}$/, 'Phone must be a Saudi number in +966XXXXXXXXX format');

export const otpRequestSchema = z.object({
  phone: saudiPhone,
});

export const otpVerifySchema = z.object({
  phone: saudiPhone,
  code: z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type OtpRequestInput = z.infer<typeof otpRequestSchema>;
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
