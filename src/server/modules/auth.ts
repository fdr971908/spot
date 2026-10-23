import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { get, post, parse, type Route } from '../router';
import { bindUser } from '../db';
import { ApiError } from '../errors';
import { checkRateLimit, createSession, CREDENTIALS_SQL, hashPassword, hashToken, SESSION_COOKIE, verifyPassword } from '../auth';

const RESERVED = new Set(['admin', 'spot', 'support', 'help', 'staff', 'moderator', 'official', 'business', 'api', 'root']);

const registerSchema = z
  .object({
    account_type: z.enum(['personal', 'business']),
    email: z.string().trim().toLowerCase().email().max(200),
    password: z.string().min(8).max(128),
    display_name: z.string().trim().min(1).max(50).optional(),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_.]{3,24}$/)
      .optional(),
    birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    city_id: z.string().max(40).nullish(),
    accept_terms: z.literal(true),
    marketing_consent: z.boolean().default(false),
  })
  .refine((v) => v.account_type === 'business' || (v.display_name && v.username), { message: 'profile_required', path: ['username'] });

export function ageFrom(birthdate: string, now = new Date()) {
  const b = new Date(birthdate + 'T00:00:00Z');
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

export const MIN_SIGNUP_AGE = 14; // Italian age of digital consent

// Native clients (React Native) authenticate with `Authorization: Bearer`; they ask for the
// token explicitly. Browsers only ever get the httpOnly cookie.
function sessionResponse(req: Request, data: Record<string, unknown>, token: string, expires: Date) {
  const res = NextResponse.json(req.headers.get('x-spot-native') === '1' ? { ...data, token } : data);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires,
  });
  return res;
}

export const authRoutes: Route[] = [
  post('/auth/register', 'public', async ({ tx, body, req, ip }) => {
    if (!checkRateLimit(`register:${ip}`, 20, 60 * 60_000)) throw new ApiError(429, 'rate_limited');
    const v = parse(registerSchema, body);
    const age = ageFrom(v.birthdate);
    if (Number.isNaN(age) || age < MIN_SIGNUP_AGE || age > 110) throw new ApiError(400, 'age_not_allowed');
    if (await tx.one(CREDENTIALS_SQL, [v.email])) throw new ApiError(409, 'email_taken');
    if (v.username) {
      if (RESERVED.has(v.username)) throw new ApiError(409, 'username_taken');
      const ok = await tx.one<{ ok: boolean }>('select app.username_available($1) as ok', [v.username]);
      if (!ok?.ok) throw new ApiError(409, 'username_taken');
    }
    const now = new Date();
    // The new row is not readable until the identity is bound, so the id is generated here (no RETURNING).
    const user = { id: randomUUID() };
    await tx.q(
      `insert into users (id, email, password_hash, account_type, birthdate, terms_accepted_at, privacy_accepted_at, marketing_consent_at)
       values ($1, $2, $3, $4, $5, $6, $6, $7)`,
      [user.id, v.email, await hashPassword(v.password), v.account_type, v.birthdate, now, v.marketing_consent ? now : null],
    );
    await bindUser(tx, user.id);
    if (v.account_type === 'personal') {
      await tx.q('insert into personal_profiles (user_id, username, display_name, city_id) values ($1, $2, $3, $4)', [user!.id, v.username, v.display_name, v.city_id ?? null]);
      await tx.q('insert into user_preferences (user_id) values ($1)', [user!.id]);
    }
    await tx.q('insert into notification_preferences (user_id, promotional) values ($1, $2)', [user!.id, v.marketing_consent]);
    const { token, expires } = await createSession(tx, user!.id, req.headers.get('user-agent'));
    return sessionResponse(req, { user: { id: user!.id, account_type: v.account_type } }, token, expires);
  }),

  post('/auth/login', 'public', async ({ tx, body, req, ip }) => {
    const v = parse(z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(128) }), body);
    if (!checkRateLimit(`login:${ip}:${v.email}`)) throw new ApiError(429, 'rate_limited');
    const cred = await tx.one<{ id: string; password_hash: string }>(CREDENTIALS_SQL, [v.email]);
    if (!cred || !(await verifyPassword(v.password, cred.password_hash))) throw new ApiError(401, 'invalid_credentials');
    await bindUser(tx, cred.id);
    const u = await tx.one<{ account_type: string; onboarding_completed_at: string | null }>('select account_type, onboarding_completed_at from users where id = $1', [cred.id]);
    const { token, expires } = await createSession(tx, cred.id, req.headers.get('user-agent'));
    return sessionResponse(req, { user: { id: cred.id, ...u } }, token, expires);
  }),

  post('/auth/logout', 'public', async ({ tx, req }) => {
    const token = req.cookies.get(SESSION_COOKIE)?.value ?? req.headers.get('authorization')?.replace(/^Bearer /, '');
    if (token) await tx.q('delete from sessions where token_hash = $1', [hashToken(token)]);
    const res = NextResponse.json({ ok: true });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }),

  // Social login is not configured in this build: explicit placeholder, never a fake success.
  get('/auth/oauth/:provider', 'public', async ({ params }) => {
    const configured = params.provider === 'google' ? !!process.env.GOOGLE_CLIENT_ID : params.provider === 'apple' ? !!process.env.APPLE_CLIENT_ID : false;
    throw new ApiError(501, configured ? 'oauth_not_implemented' : 'oauth_not_configured');
  }),

  get('/auth/username-available', 'public', async ({ tx, query }) => {
    const u = (query.get('u') ?? '').toLowerCase();
    if (!/^[a-z0-9_.]{3,24}$/.test(u) || RESERVED.has(u)) return { available: false };
    const r = await tx.one<{ ok: boolean }>('select app.username_available($1) as ok', [u]);
    return { available: !!r?.ok };
  }),
];
