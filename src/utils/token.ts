import jwt from 'jsonwebtoken';
import { envConfig } from '../config/envConfig';

export interface TokenPayload {
  userId: string;
  email: string;
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, envConfig.JWT_ACCESS_SECRET, {
    expiresIn: envConfig.JWT_ACCESS_EXPIRES as any,
  });
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, envConfig.JWT_REFRESH_SECRET, {
    expiresIn: envConfig.JWT_REFRESH_EXPIRES as any,
  });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, envConfig.JWT_ACCESS_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, envConfig.JWT_REFRESH_SECRET) as TokenPayload;
}
