import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32) {
  // We refuse to start with a weak secret in production.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set to a strong value (>=32 chars) in production.');
  }
  console.warn('[auth] JWT_SECRET is missing or weak. Using a dev fallback. DO NOT use this in production.');
}

const EFFECTIVE_SECRET = SECRET || 'softspace-dev-only-secret-please-change';
const TOKEN_TTL_DAYS = 30;

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload) {
  return jwt.sign(payload, EFFECTIVE_SECRET, { expiresIn: `${TOKEN_TTL_DAYS}d` });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, EFFECTIVE_SECRET);
  } catch {
    return null;
  }
}

export function tokenExpiry() {
  return new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}
