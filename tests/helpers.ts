import { NextRequest } from 'next/server';
import { handle } from '@/server/api';

export async function call(method: string, path: string, opts: { body?: unknown; token?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-spot-native': '1' };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const req = new NextRequest(`http://localhost/api${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const res = await handle(req, path.split('?')[0].split('/').filter(Boolean));
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

export async function login(email: string, password = 'spotdemo123') {
  const r = await call('POST', '/auth/login', { body: { email, password } });
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(r.json)}`);
  return r.json.token as string;
}
