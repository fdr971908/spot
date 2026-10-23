import { loadEnv } from '../db/env';

loadEnv();
// Integration tests run against a separate database (default: <db>_test).
const swap = (u: string) => u.replace(/\/([^/?]+)(\?|$)/, (_, db, q) => `/${db.endsWith('_test') ? db : db + '_test'}${q}`);
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? swap(process.env.DATABASE_URL!);
process.env.DATABASE_ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? swap(process.env.DATABASE_ADMIN_URL!);
process.env.CRON_SECRET = 'test-secret';
