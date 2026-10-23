import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Tx } from './db';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const N = 16384, R = 8, P = 1, KEYLEN = 64;

export const SESSION_COOKIE = 'spot_session';
export const SESSION_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, hash] = stored.split('$');
  if (algo !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: +n, r: +r, p: +p });
  return timingSafeEqual(expected, actual);
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(tx: Tx, userId: string, userAgent?: string | null) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await tx.q('insert into sessions (token_hash, user_id, expires_at, user_agent) values ($1, $2, $3, $4)', [
    hashToken(token),
    userId,
    expires,
    userAgent?.slice(0, 200) ?? null,
  ]);
  return { token, expires };
}

export interface SessionUser {
  id: string;
  email: string;
  account_type: 'personal' | 'business';
  birthdate: string | null;
  onboarding_completed_at: string | null;
  is_adult: boolean;
}

/** Credential lookup happens before an RLS identity exists, so it uses a definer function. */
export const CREDENTIALS_SQL = 'select id, password_hash from app.auth_credentials($1)';

// Simple in-memory brute-force protection (per process).
const attempts = new Map<string, { n: number; until: number }>();
export function checkRateLimit(key: string, max = 10, windowMs = 15 * 60_000) {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.until < now) {
    attempts.set(key, { n: 1, until: now + windowMs });
    return true;
  }
  a.n += 1;
  return a.n <= max;
}
