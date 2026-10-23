import { Client } from 'pg';

/**
 * In-process realtime broker: one LISTEN connection per server process fans
 * out Postgres NOTIFY payloads (ids only) to connected SSE clients. Clients
 * refetch through the API, so RLS still decides what they can read.
 * For multi-instance deployments the same NOTIFY channel works per instance;
 * on Supabase use Realtime subscriptions instead (see README).
 */
type Listener = (event: { t: string; c?: string; m?: string }) => void;

interface Broker {
  listeners: Map<string, Set<Listener>>;
  client: Client | null;
  connecting: Promise<void> | null;
}

const g = globalThis as unknown as { __spotBroker?: Broker };
const broker: Broker = (g.__spotBroker ??= { listeners: new Map(), client: null, connecting: null });

async function ensureConnected() {
  if (broker.client) return;
  if (broker.connecting) return broker.connecting;
  broker.connecting = (async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    client.on('notification', (msg) => {
      try {
        const payload = JSON.parse(msg.payload ?? '{}');
        for (const uid of payload.u ?? []) for (const l of broker.listeners.get(uid) ?? []) l({ t: payload.t, c: payload.c, m: payload.m });
      } catch {
        /* ignore malformed payloads */
      }
    });
    client.on('error', () => {
      broker.client = null;
    });
    client.on('end', () => {
      broker.client = null;
    });
    await client.connect();
    await client.query('listen spot_realtime');
    broker.client = client;
  })().finally(() => {
    broker.connecting = null;
  });
  return broker.connecting;
}

export async function subscribe(userId: string, listener: Listener) {
  await ensureConnected();
  let set = broker.listeners.get(userId);
  if (!set) broker.listeners.set(userId, (set = new Set()));
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (!set!.size) broker.listeners.delete(userId);
  };
}
