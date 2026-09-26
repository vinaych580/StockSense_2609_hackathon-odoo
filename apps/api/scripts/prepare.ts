/**
 * `pnpm db:prepare`: apply pending migrations and restore system data; seed the demo data only if
 * the database has no users yet. Safe to run on every start, and it never wipes existing work
 * (use `pnpm db:reset` for that).
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { prisma } from '../src/lib/db';
import { ensureSystemData } from '../src/system/ensure-system-data';

const run = (cmd: string) => execSync(cmd, { stdio: 'inherit', env: process.env });

run('npx prisma migrate deploy');
await ensureSystemData(prisma);
const users = await prisma.user.count();
await prisma.$disconnect();

if (users === 0) {
  console.log('Empty database: loading the demo data.');
  run('npx tsx src/seed/index.ts');
} else {
  console.log(`Database ready (${users} users). Run \`pnpm db:reset\` to restore the demo data.`);
}
