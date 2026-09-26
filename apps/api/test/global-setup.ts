/**
 * Makes sure a Postgres is reachable (starting the embedded one if nothing listens on PG_PORT),
 * that stocksense_test exists, and that it is fully migrated.
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { isPortOpen, startEmbedded } from '../scripts/pg';

export default async function setup(): Promise<() => Promise<void>> {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error('TEST_DATABASE_URL is not set (copy .env.example to apps/api/.env)');

  let stop: (() => Promise<void>) | undefined;
  if (!(await isPortOpen())) stop = await startEmbedded();

  const admin = new PrismaClient({ datasourceUrl: testUrl.replace(/\/[^/?]+(\?|$)/, '/postgres$1') });
  const dbName = new URL(testUrl).pathname.slice(1);
  const exists = await admin.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
  if (exists.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  await admin.$disconnect();

  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: testUrl }, stdio: 'pipe' });

  return async () => {
    if (stop) await stop();
  };
}
