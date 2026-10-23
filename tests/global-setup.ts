import './env';
import { migrate } from '../db/migrate';
import { seed } from '../db/seed';

export default async function () {
  await migrate({ reset: true, quiet: true });
  await seed(process.env.DATABASE_ADMIN_URL!, { quiet: true });
}
