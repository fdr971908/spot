import { Pool, type PoolClient, types } from 'pg';

// numeric → number (prices), int8 → number (counts never exceed 2^53 here)
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
// date → keep as 'YYYY-MM-DD' string
types.setTypeParser(1082, (v) => v);

const g = globalThis as unknown as { __spotPool?: Pool };

export function getPool(): Pool {
  if (!g.__spotPool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    g.__spotPool = new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_MAX ?? 10) });
  }
  return g.__spotPool;
}

export interface Tx {
  /** Rows of a query. */
  q<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** First row or null. */
  one<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<T | null>;
  /** The authenticated user id bound to this transaction (RLS context). */
  uid: string | null;
  client: PoolClient;
}

function makeTx(client: PoolClient, uid: string | null): Tx {
  return {
    uid,
    client,
    async q(sql, params) {
      return (await client.query(sql, params as any[])).rows;
    },
    async one(sql, params) {
      return (await client.query(sql, params as any[])).rows[0] ?? null;
    },
  };
}

/**
 * Runs `fn` in a transaction whose RLS identity is `userId`
 * (`app.uid()` in SQL). Every request to the API goes through here.
 */
export async function withUser<T>(userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.user_id', $1, true)", [userId ?? '']);
    const result = await fn(makeTx(client, userId));
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Re-binds the RLS identity inside an open transaction (used right after registration). */
export async function bindUser(tx: Tx, userId: string) {
  await tx.client.query("select set_config('app.user_id', $1, true)", [userId]);
  tx.uid = userId;
}
