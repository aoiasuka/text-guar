import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role } from '@text-guard/shared';

const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
const expiresIn = (process.env.JWT_EXPIRES_IN || '15m') as SignOptions['expiresIn'];

export interface JwtPayload {
  id: number;
  username: string;
  role: Role;
}

export function signToken(payload: JwtPayload) {
  return jwt.sign(payload, secret, { expiresIn });
}

export function verifyToken(token: string) {
  return jwt.verify(token, secret) as JwtPayload;
}
