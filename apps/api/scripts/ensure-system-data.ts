import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { ensureSystemData } from '../src/system/ensure-system-data';

await ensureSystemData(prisma);
await prisma.$disconnect();
console.log('System data in place (virtual locations).');
