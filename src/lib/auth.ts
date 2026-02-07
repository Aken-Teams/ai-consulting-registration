import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createHmac } from 'node:crypto';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = '24h';

export interface JwtPayload {
  userId: number;
  email: string;
  role: 'admin' | 'consultant';
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function generateShareToken(caseId: number): string {
  return createHmac('sha256', JWT_SECRET).update(`prd-share:${caseId}`).digest('hex').slice(0, 32);
}

export function verifyShareToken(token: string, caseId: number): boolean {
  const expected = generateShareToken(caseId);
  return token === expected;
}
