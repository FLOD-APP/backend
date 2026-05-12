import { createHash } from 'node:crypto';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and, gt } from 'drizzle-orm';
import type * as schemaTypes from '../db/schema.js';
import { users, otpCodes, refreshTokens } from '../db/schema.js';
import { generateOtp, hashOtp, verifyOtp } from '../utils/otp.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { AppError } from '../utils/errors.js';

type Db = PostgresJsDatabase<typeof schemaTypes>;

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_REFRESH_TOKENS = 5;

/** Hash a refresh token for storage (SHA-256, not bcrypt — tokens are high-entropy) */
function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class AuthService {
  constructor(private db: Db) {}

  /** R5.AC1: Request OTP — generate, hash, store with TTL */
  async requestOtp(phone: string): Promise<{ sent: true; otp: string }> {
    const otp = generateOtp();
    const codeHash = await hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await this.db.insert(otpCodes).values({
      phone,
      codeHash,
      expiresAt,
    });

    // V0: return OTP in response for console logging (no SMS gateway yet)
    return { sent: true, otp };
  }

  /** R5.AC3/AC4/AC7: Verify OTP, auto-create user, issue tokens */
  async verifyOtp(phone: string, code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; phone: string; isNew: boolean };
  }> {
    // Find the most recent unused, unexpired OTP for this phone
    const now = new Date();
    const otpRows = await this.db
      .select()
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.phone, phone),
          eq(otpCodes.used, false),
          gt(otpCodes.expiresAt, now)
        )
      )
      .orderBy(otpCodes.createdAt)
      .limit(5);

    // Try each OTP (most recent first — reversed)
    let matchedOtp: typeof otpRows[number] | null = null;
    for (const row of otpRows.reverse()) {
      const isValid = await verifyOtp(code, row.codeHash);
      if (isValid) {
        matchedOtp = row;
        break;
      }
    }

    if (!matchedOtp) {
      throw new AppError('Invalid or expired OTP', 'OTP_INVALID', 401);
    }

    // Mark OTP as used
    await this.db
      .update(otpCodes)
      .set({ used: true })
      .where(eq(otpCodes.id, matchedOtp.id));

    // R5.AC7: Auto-create user if not exists
    let isNew = false;
    let userRows = await this.db
      .select()
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);

    if (userRows.length === 0) {
      isNew = true;
      userRows = await this.db
        .insert(users)
        .values({ phone })
        .returning();
    }

    const user = userRows[0]!;

    // Issue tokens
    const accessToken = signAccessToken({ userId: user.id, phone: user.phone });
    const refreshToken = signRefreshToken({ userId: user.id, phone: user.phone });

    // Store refresh token hash
    const tokenHash = hashRefreshToken(refreshToken);
    const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await this.db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt: refreshExpiresAt,
    });

    // Enforce max 5 active refresh tokens per user
    await this.pruneRefreshTokens(user.id);

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, phone: user.phone, isNew },
    };
  }

  /** R5.AC5/AC6: Refresh token rotation */
  async refresh(rawRefreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    // Verify JWT signature and expiry
    let payload: { userId: string; phone: string };
    try {
      payload = verifyRefreshToken(rawRefreshToken);
    } catch {
      throw new AppError('Invalid or expired refresh token', 'REFRESH_TOKEN_INVALID', 401);
    }

    // Find the stored refresh token
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const storedRows = await this.db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          eq(refreshTokens.revoked, false),
          gt(refreshTokens.expiresAt, new Date())
        )
      )
      .limit(1);

    if (storedRows.length === 0) {
      throw new AppError('Refresh token not found or revoked', 'REFRESH_TOKEN_INVALID', 401);
    }

    // Revoke the old token (rotation)
    await this.db
      .update(refreshTokens)
      .set({ revoked: true })
      .where(eq(refreshTokens.id, storedRows[0]!.id));

    // Issue new pair
    const newAccessToken = signAccessToken({ userId: payload.userId, phone: payload.phone });
    const newRefreshToken = signRefreshToken({ userId: payload.userId, phone: payload.phone });

    // Store new refresh token
    const newTokenHash = hashRefreshToken(newRefreshToken);
    const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await this.db.insert(refreshTokens).values({
      userId: payload.userId,
      tokenHash: newTokenHash,
      expiresAt: refreshExpiresAt,
    });

    await this.pruneRefreshTokens(payload.userId);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  /** Keep at most MAX_REFRESH_TOKENS active tokens per user */
  private async pruneRefreshTokens(userId: string): Promise<void> {
    const activeTokens = await this.db
      .select({ id: refreshTokens.id })
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.userId, userId),
          eq(refreshTokens.revoked, false)
        )
      )
      .orderBy(refreshTokens.createdAt);

    if (activeTokens.length > MAX_REFRESH_TOKENS) {
      const toRevoke = activeTokens.slice(0, activeTokens.length - MAX_REFRESH_TOKENS);
      for (const row of toRevoke) {
        await this.db
          .update(refreshTokens)
          .set({ revoked: true })
          .where(eq(refreshTokens.id, row.id));
      }
    }
  }
}
