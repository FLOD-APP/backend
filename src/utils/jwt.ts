import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { JwtPayload } from '../middleware/auth.middleware.js';

const ACCESS_TOKEN_EXPIRY = '1h';
const REFRESH_TOKEN_EXPIRY = '30d';

function getSecret(envKey: string): string {
  const secret = process.env[envKey];
  if (!secret) {
    throw new Error(`${envKey} environment variable is required`);
  }
  return secret;
}

/** Sign a JWT access token (1h expiry) */
export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, getSecret('JWT_SECRET'), { expiresIn: ACCESS_TOKEN_EXPIRY });
}

/** Verify and decode a JWT access token */
export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, getSecret('JWT_SECRET')) as JwtPayload;
}

/** Sign a JWT refresh token (30d expiry, unique jti for rotation safety) */
export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, getSecret('JWT_REFRESH_SECRET'), {
    expiresIn: REFRESH_TOKEN_EXPIRY,
    jwtid: randomUUID(),
  });
}

/** Verify and decode a JWT refresh token */
export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, getSecret('JWT_REFRESH_SECRET')) as JwtPayload;
}
