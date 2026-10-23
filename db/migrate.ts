/**
 * Applies db/migrations/*.sql in order, as the database owner.
 *   npm run db:migrate            apply pending migrations
 *   npm run db:migrate -- --reset drop everything first (dev only)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { loadEnv } from './env';

loadEnv();

export async function migrate({ reset = false, adminUrl = process.env.DATABASE_ADMIN_URL, appUrl = process.env.DATABASE_URL, quiet = false } = {}) {
  if (!adminUrl || !appUrl) throw new Error('DATABASE_ADMIN_URL and DATABASE_URL are required');
  const app = new URL(appUrl);
  const appRole = decodeURIComponent(app.username);
  const appPassword = decodeURIComponent(app.password);
  if (!/^[a-z_][a-z0-9_]*$/.test(appRole)) throw new Error('Invalid app role name');

  const db = new Client({ connectionString: adminUrl });
  await db.connect();
  const log = (...a: unknown[]) => !quiet && console.log(...a);
  try {
    if (reset) {
      log('↺ resetting schema');
      await db.query('drop schema if exists app cascade; drop schema if exists public cascade; create schema public;');
    }
    const role = await db.query('select 1 from pg_roles where rolname = $1', [appRole]);
    if (role.rowCount === 0) {
      await db.query(`create role ${appRole} login password '${appPassword.replace(/'/g, "''")}' nosuperuser nobypassrls`);
      log(`✓ created role ${appRole}`);
    }
    await db.query(`grant usage on schema public to ${appRole}`);
    await db.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
    const done = new Set((await db.query('select name from schema_migrations')).rows.map((r) => r.name));
    const dir = join(__dirname, 'migrations');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      if (done.has(file)) continue;
      const sql = readFileSync(join(dir, file), 'utf8').replaceAll('spot_app', appRole);
      await db.query('begin');
      try {
        await db.query(sql);
        await db.query('insert into schema_migrations (name) values ($1)', [file]);
        await db.query('commit');
        log(`✓ ${file}`);
      } catch (e) {
        await db.query('rollback');
        throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  migrate({ reset: process.argv.includes('--reset') }).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
