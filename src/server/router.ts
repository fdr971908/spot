import { NextResponse, type NextRequest } from 'next/server';
import { z, ZodError, type ZodTypeAny } from 'zod';
import { bindUser, withUser, type Tx } from './db';
import { ApiError, fromPg, unauthorized, forbidden } from './errors';
import { hashToken, SESSION_COOKIE, type SessionUser } from './auth';

export type Auth = 'public' | 'user' | 'personal' | 'business';

export interface Ctx {
  req: NextRequest;
  tx: Tx;
  user: SessionUser | null;
  params: Record<string, string>;
  query: URLSearchParams;
  body: any;
  ip: string;
}

export interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  parts: string[];
  auth: Auth;
  handler: (ctx: Ctx & { user: SessionUser }) => Promise<unknown>;
}

const mk =
  (method: Route['method']) =>
  (path: string, auth: Auth, handler: (ctx: Ctx & { user: SessionUser }) => Promise<unknown>): Route => ({
    method,
    parts: path.split('/').filter(Boolean),
    auth,
    handler,
  });

export const get = mk('GET');
export const post = mk('POST');
export const put = mk('PUT');
export const patch = mk('PATCH');
export const del = mk('DELETE');

/** Validates input with zod, throwing a 400 with field issues. */
export function parse<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  return schema.parse(value);
}

function match(route: Route, method: string, segs: string[]) {
  if (route.method !== method || route.parts.length !== segs.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < segs.length; i++) {
    const p = route.parts[i];
    if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(segs[i]);
    else if (p !== segs[i]) return null;
  }
  return params;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadSession(tx: Tx, token: string | null): Promise<SessionUser | null> {
  if (!token) return null;
  const s = await tx.one<{ user_id: string }>('select user_id from sessions where token_hash = $1 and expires_at > now()', [hashToken(token)]);
  if (!s) return null;
  await bindUser(tx, s.user_id);
  return tx.one<SessionUser>(
    `select id, email, account_type, birthdate, onboarding_completed_at, app.is_adult(id) as is_adult from users where id = $1`,
    [s.user_id],
  );
}

export function createHandler(routes: Route[]) {
  return async function handle(req: NextRequest, segs: string[]): Promise<Response> {
    const method = req.method.toUpperCase();
    let found: { route: Route; params: Record<string, string> } | null = null;
    for (const route of routes) {
      const params = match(route, method, segs);
      if (params) {
        found = { route, params };
        break;
      }
    }
    if (!found) return NextResponse.json({ error: { code: 'not_found' } }, { status: 404 });
    // ids in path must be uuids (avoids 500s on malformed input)
    for (const [k, v] of Object.entries(found.params)) {
      if (/id$/i.test(k) && !UUID.test(v)) return NextResponse.json({ error: { code: 'not_found' } }, { status: 404 });
    }

    const bearer = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1] ?? null;
    const cookie = req.cookies.get(SESSION_COOKIE)?.value ?? null;
    const token = bearer ?? cookie;

    // CSRF: cookie-authenticated mutations must come from our own client.
    if (method !== 'GET' && !bearer && cookie && req.headers.get('x-spot-client') !== '1') {
      return NextResponse.json({ error: { code: 'csrf' } }, { status: 403 });
    }

    let body: any = undefined;
    if (method !== 'GET' && req.headers.get('content-type')?.includes('application/json')) {
      try {
        const text = await req.text();
        body = text.trim() ? JSON.parse(text) : {};
      } catch {
        return NextResponse.json({ error: { code: 'invalid_json' } }, { status: 400 });
      }
    }

    try {
      const result = await withUser(null, async (tx) => {
        const user = await loadSession(tx, token);
        const { auth } = found!.route;
        if (auth !== 'public' && !user) throw unauthorized();
        if (auth === 'personal' && user!.account_type !== 'personal') throw forbidden('personal_account_required');
        if (auth === 'business' && user!.account_type !== 'business') throw forbidden('business_account_required');
        return found!.route.handler({
          req,
          tx,
          user: user as SessionUser,
          params: found!.params,
          query: req.nextUrl.searchParams,
          body: body ?? {},
          ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local',
        });
      });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (e: any) {
      if (e instanceof ZodError) {
        return NextResponse.json({ error: { code: 'validation', issues: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } }, { status: 400 });
      }
      const err = e instanceof ApiError ? e : fromPg(e);
      if (err) return NextResponse.json({ error: { code: err.code, details: err.details } }, { status: err.status });
      console.error('[api]', method, segs.join('/'), e);
      return NextResponse.json({ error: { code: 'server_error' } }, { status: 500 });
    }
  };
}
