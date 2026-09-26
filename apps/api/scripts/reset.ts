/**
 * `pnpm db:reset`: apply any pending migrations, then reseed (the seed truncates every table and
 * restores system data first), so the result is the same every time. To rebuild the schema from
 * scratch after editing a migration locally, run `npx prisma migrate reset` yourself.
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';

const run = (cmd: string) => execSync(cmd, { stdio: 'inherit', env: process.env });
run('npx prisma migrate deploy');
run('npx tsx src/seed/index.ts');
