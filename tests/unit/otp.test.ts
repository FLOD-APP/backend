import { generateOtp, hashOtp, verifyOtp } from '../../src/utils/otp';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from '../../src/utils/jwt';
import { otpRequestSchema, otpVerifySchema, refreshSchema } from '../../src/validators/auth.validators';

// ── OTP Generation ─────────────────────────────────────────
describe('OTP — generateOtp', () => {
  it('R5.AC1: should generate a 6-digit numeric string', () => {
    const otp = generateOtp();
    expect(otp).toMatch(/^\d{6}$/);
  });

  it('R5.AC1: should generate different codes on successive calls', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateOtp()));
    // With 1M combinations, 20 calls should produce at least 10 unique
    expect(codes.size).toBeGreaterThanOrEqual(10);
  });
});

// ── OTP Hashing & Verification ─────────────────────────────
describe('OTP — hash and verify', () => {
  it('R5.AC1: hashOtp should return a bcrypt hash different from plaintext', async () => {
    const otp = '123456';
    const hash = await hashOtp(otp);
    expect(hash).not.toBe(otp);
    expect(hash.startsWith('$2')).toBe(true); // bcrypt prefix
  });

  it('R5.AC1: verifyOtp should return true for correct code', async () => {
    const otp = '654321';
    const hash = await hashOtp(otp);
    const result = await verifyOtp(otp, hash);
    expect(result).toBe(true);
  });

  it('R5.AC4: verifyOtp should return false for incorrect code', async () => {
    const hash = await hashOtp('111111');
    const result = await verifyOtp('999999', hash);
    expect(result).toBe(false);
  });
});

// ── JWT Utilities ──────────────────────────────────────────
describe('JWT — access token', () => {
  const secret = 'test-secret-at-least-32-characters-long!!';
  const refreshSecret = 'test-refresh-secret-at-least-32-chars!!';

  beforeAll(() => {
    process.env['JWT_SECRET'] = secret;
    process.env['JWT_REFRESH_SECRET'] = refreshSecret;
  });

  afterAll(() => {
    delete process.env['JWT_SECRET'];
    delete process.env['JWT_REFRESH_SECRET'];
  });

  it('R5.AC3: signAccessToken should return a JWT string', () => {
    const token = signAccessToken({ userId: 'u1', phone: '+966500000001' });
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // header.payload.signature
  });

  it('R5.AC3: verifyAccessToken should decode payload with userId and phone', () => {
    const token = signAccessToken({ userId: 'u1', phone: '+966500000001' });
    const payload = verifyAccessToken(token);
    expect(payload.userId).toBe('u1');
    expect(payload.phone).toBe('+966500000001');
  });

  it('R5.AC3: access token should have ~1h expiry', () => {
    const token = signAccessToken({ userId: 'u1', phone: '+966500000001' });
    const payload = verifyAccessToken(token);
    const exp = (payload as unknown as { exp: number }).exp;
    const iat = (payload as unknown as { iat: number }).iat;
    expect(exp - iat).toBe(3600); // 1 hour
  });

  it('should reject a tampered access token', () => {
    const token = signAccessToken({ userId: 'u1', phone: '+966500000001' });
    const tampered = token.slice(0, -5) + 'XXXXX';
    expect(() => verifyAccessToken(tampered)).toThrow();
  });
});

describe('JWT — refresh token', () => {
  const secret = 'test-secret-at-least-32-characters-long!!';
  const refreshSecret = 'test-refresh-secret-at-least-32-chars!!';

  beforeAll(() => {
    process.env['JWT_SECRET'] = secret;
    process.env['JWT_REFRESH_SECRET'] = refreshSecret;
  });

  afterAll(() => {
    delete process.env['JWT_SECRET'];
    delete process.env['JWT_REFRESH_SECRET'];
  });

  it('R5.AC5: signRefreshToken should return a JWT string', () => {
    const token = signRefreshToken({ userId: 'u1', phone: '+966500000001' });
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  it('R5.AC5: refresh token should have ~30d expiry', () => {
    const token = signRefreshToken({ userId: 'u1', phone: '+966500000001' });
    const payload = verifyRefreshToken(token);
    const exp = (payload as unknown as { exp: number }).exp;
    const iat = (payload as unknown as { iat: number }).iat;
    expect(exp - iat).toBe(30 * 24 * 3600); // 30 days
  });

  it('should not verify refresh token with access token secret', () => {
    const token = signRefreshToken({ userId: 'u1', phone: '+966500000001' });
    expect(() => verifyAccessToken(token)).toThrow();
  });
});

// ── Zod Validators ─────────────────────────────────────────
describe('Zod — otpRequestSchema', () => {
  it('R5.AC1: should accept valid Saudi phone (+966 + 9 digits)', () => {
    const result = otpRequestSchema.safeParse({ phone: '+966512345678' });
    expect(result.success).toBe(true);
  });

  it('R5.AC2: should reject phone without +966 prefix', () => {
    const result = otpRequestSchema.safeParse({ phone: '0512345678' });
    expect(result.success).toBe(false);
  });

  it('R5.AC2: should reject phone with wrong digit count', () => {
    const result = otpRequestSchema.safeParse({ phone: '+96651234567' }); // 8 digits
    expect(result.success).toBe(false);
  });

  it('R5.AC2: should reject missing phone', () => {
    const result = otpRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('R5.AC2: should reject non-numeric phone', () => {
    const result = otpRequestSchema.safeParse({ phone: '+966abcdefghi' });
    expect(result.success).toBe(false);
  });
});

describe('Zod — otpVerifySchema', () => {
  it('R5.AC3: should accept valid phone + 6-digit code', () => {
    const result = otpVerifySchema.safeParse({ phone: '+966512345678', code: '123456' });
    expect(result.success).toBe(true);
  });

  it('R5.AC4: should reject code with wrong length', () => {
    const result = otpVerifySchema.safeParse({ phone: '+966512345678', code: '12345' });
    expect(result.success).toBe(false);
  });

  it('R5.AC4: should reject non-numeric code', () => {
    const result = otpVerifySchema.safeParse({ phone: '+966512345678', code: 'abcdef' });
    expect(result.success).toBe(false);
  });
});

describe('Zod — refreshSchema', () => {
  it('R5.AC5: should accept valid refreshToken string', () => {
    const result = refreshSchema.safeParse({ refreshToken: 'some.jwt.token' });
    expect(result.success).toBe(true);
  });

  it('R5.AC6: should reject empty refreshToken', () => {
    const result = refreshSchema.safeParse({ refreshToken: '' });
    expect(result.success).toBe(false);
  });

  it('R5.AC6: should reject missing refreshToken', () => {
    const result = refreshSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
