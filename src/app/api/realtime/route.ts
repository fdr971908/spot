import type { NextRequest } from 'next/server';
import { withUser } from '@/server/db';
import { hashToken, SESSION_COOKIE } from '@/server/auth';
import { subscribe } from '@/server/realtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Server-Sent Events stream of realtime hints for the signed-in user. */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return new Response('unauthorized', { status: 401 });
  const session = await withUser(null, (tx) =>
    tx.one<{ user_id: string }>('select user_id from sessions where token_hash = $1 and expires_at > now()', [hashToken(token)]),
  );
  if (!session) return new Response('unauthorized', { status: 401 });

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const unsubscribe = await subscribe(session.user_id, send);
      const ping = setInterval(() => send({ t: 'ping' }), 25_000);
      cleanup = () => {
        clearInterval(ping);
        unsubscribe();
      };
      req.signal.addEventListener('abort', () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
      send({ t: 'ready' });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' },
  });
}
