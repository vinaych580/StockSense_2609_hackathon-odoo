import { Prisma } from '@prisma/client';
import { prisma, type Tx } from '../lib/db';

export interface IntegrityMismatch {
  productId: string;
  locationId: string;
  expected: string;
  actual: string;
}

export interface IntegrityReport {
  ok: boolean;
  balancesChecked: number;
  movesChecked: number;
  mismatches: IntegrityMismatch[];
}

/**
 * Ledger reconciliation: every balance must equal the moves into its location minus the moves
 * out of it, and none may be negative. Runs in tests, at the end of the seed, as `pnpm db:check`,
 * and behind the Manager-only "Ledger integrity" dashboard card.
 */
export async function checkLedger(db: Tx | typeof prisma = prisma): Promise<IntegrityReport> {
  const mismatches = await db.$queryRaw<Array<{ product_id: string; location_id: string; expected: Prisma.Decimal; actual: Prisma.Decimal }>>`
    WITH flows AS (
      SELECT product_id, to_location_id AS location_id, quantity AS q FROM stock_move
      UNION ALL
      SELECT product_id, from_location_id, -quantity FROM stock_move
    ), expected AS (
      SELECT f.product_id, f.location_id, SUM(f.q) AS qty
      FROM flows f JOIN location l ON l.id = f.location_id AND l.type = 'INTERNAL'
      GROUP BY f.product_id, f.location_id
    )
    SELECT COALESCE(e.product_id, q.product_id)::text AS product_id,
           COALESCE(e.location_id, q.location_id)::text AS location_id,
           COALESCE(e.qty, 0) AS expected, COALESCE(q.quantity, 0) AS actual
    FROM expected e
    FULL JOIN stock_quant q ON q.product_id = e.product_id AND q.location_id = e.location_id
    WHERE COALESCE(e.qty, 0) <> COALESCE(q.quantity, 0) OR COALESCE(q.quantity, 0) < 0 OR COALESCE(e.qty, 0) < 0`;
  const [counts] = await db.$queryRaw<Array<{ balances: number; moves: number }>>`
    SELECT (SELECT COUNT(*)::int FROM stock_quant) AS balances, (SELECT COUNT(*)::int FROM stock_move) AS moves`;
  return {
    ok: mismatches.length === 0,
    balancesChecked: counts?.balances ?? 0,
    movesChecked: counts?.moves ?? 0,
    mismatches: mismatches.map((m) => ({
      productId: m.product_id,
      locationId: m.location_id,
      expected: new Prisma.Decimal(m.expected).toFixed(3),
      actual: new Prisma.Decimal(m.actual).toFixed(3),
    })),
  };
}
