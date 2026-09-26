/**
 * `pnpm db:seed` (master + stock) or `pnpm db:seed master` (no stock). Truncates every table first,
 * then restores system data. Refuses to run in production or against a non-local database.
 */
import 'dotenv/config';
import { prisma } from '../lib/db';
import { checkLedger } from '../inventory/integrity';
import { ensureSystemData } from '../system/ensure-system-data';
import { seedMaster } from './master';
import { seedStock, summary } from './stock';

const url = process.env.DATABASE_URL ?? '';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url)) {
  console.error('Refusing to seed: NODE_ENV is production or DATABASE_URL is not on localhost.');
  process.exit(1);
}

const only = process.argv[2];

const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
  SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
await ensureSystemData(prisma);

await seedMaster(prisma);
console.log('seed:master done (6 users, 2 warehouses, 24 products, 8 contacts, 8 reorder rules).');

if (only !== 'master') {
  await seedStock();
  console.log(`seed:stock done. ${await summary()}`);
  const report = await checkLedger();
  if (!report.ok) {
    console.error('LEDGER MISMATCH after seeding:', report.mismatches);
    process.exit(1);
  }
  console.log(`Ledger integrity OK: ${report.balancesChecked} balances match ${report.movesChecked} moves.`);
}
await prisma.$disconnect();
