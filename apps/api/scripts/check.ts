/** `pnpm db:check`: ledger reconciliation against the dev database. Exits 1 on any mismatch. */
import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { checkLedger } from '../src/inventory/integrity';

const report = await checkLedger();
await prisma.$disconnect();
if (report.ok) {
  console.log(`Ledger integrity OK: ${report.balancesChecked} balances match ${report.movesChecked} moves.`);
} else {
  console.error(`Ledger integrity FAILED: ${report.mismatches.length} balance(s) don't match their moves.`);
  console.table(report.mismatches);
  process.exit(1);
}
