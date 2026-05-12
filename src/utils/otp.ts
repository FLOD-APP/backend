import { randomInt } from 'node:crypto';
import bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 10;

/** Generate a cryptographically random 6-digit OTP */
export function generateOtp(): string {
  return randomInt(100_000, 1_000_000).toString();
}

/** Hash an OTP code with bcrypt for storage */
export async function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, BCRYPT_ROUNDS);
}

/** Verify an OTP against its bcrypt hash (constant-time) */
export async function verifyOtp(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}
