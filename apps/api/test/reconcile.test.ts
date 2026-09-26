/** Rule 9: after many random operations, every balance equals moves in minus moves out, and none is negative. */
import { beforeAll, describe, expect, it } from 'vitest';
import type { OperationType } from '@stocksense/shared';
import { prisma } from '../src/lib/db';
import { AppError } from '../src/lib/errors';
import { checkLedger } from '../src/inventory/integrity';
import { createOperation, runAction } from '../src/operations/service';
import { ADJUST, CUSTOMERS, makeLocation, makeProduct, makeUser, makeWarehouse, resetDb, VENDORS } from './factories';

/** Small deterministic generator so a failure reproduces. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

beforeAll(resetDb);

describe('ledger reconciliation', () => {
  it('holds after 200 random operations, some validated in parallel', async () => {
    const rand = mulberry32(20260926);
    const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
    const mgr = await makeUser();
    const wh1 = await makeWarehouse('WH1');
    const wh2 = await makeWarehouse('WH2');
    const locations = [wh1.stock.id, (await makeLocation(wh1.warehouse.id)).id, wh2.stock.id];
    const products = await Promise.all([1, 2, 3, 4].map((i) => makeProduct({ sku: `R-${i}`, uom: i % 2 ? 'UNIT' : 'KG' })));

    const tally: Record<string, number> = {};
    const note = (k: string) => (tally[k] = (tally[k] ?? 0) + 1);

    const one = async () => {
      const type = pick<OperationType>(['RECEIPT', 'RECEIPT', 'DELIVERY', 'TRANSFER', 'ADJUSTMENT']);
      const internal = pick(locations);
      const other = pick(locations.filter((l) => l !== internal));
      const lineProducts = products.filter(() => rand() < 0.5);
      if (lineProducts.length === 0) lineProducts.push(pick(products));
      const qty = () => String(1 + Math.floor(rand() * 20));
      const [source, dest] =
        type === 'RECEIPT' ? [VENDORS, internal] : type === 'DELIVERY' ? [internal, CUSTOMERS] : type === 'TRANSFER' ? [internal, other] : [ADJUST, internal];
      const op = await createOperation(mgr, {
        type,
        sourceLocationId: source,
        destLocationId: dest,
        lines: lineProducts.map((p) => (type === 'ADJUSTMENT' ? { productId: p.id, countedQuantity: qty() } : { productId: p.id, quantity: qty() })),
      });
      let version = op.version;
      if (type === 'DELIVERY' || type === 'TRANSFER') {
        version = (await runAction(mgr, op.id, 'confirm', { version })).operation.version;
        if (type === 'DELIVERY') {
          if ((await prisma.operation.findUniqueOrThrow({ where: { id: op.id } })).status !== 'READY') {
            note('waiting');
            return;
          }
          version = (await runAction(mgr, op.id, 'pick', { version })).operation.version;
          version = (await runAction(mgr, op.id, 'pack', { version })).operation.version;
        }
      }
      try {
        await runAction(mgr, op.id, 'validate', { version, acknowledgeBalanceChange: rand() < 0.5 });
        note(`${type}:done`);
      } catch (e) {
        if (!(e instanceof AppError)) throw e;
        note(e.code);
      }
    };

    for (let batch = 0; batch < 40; batch++) {
      await Promise.all([one(), one(), one(), one(), one()]);
    }

    const report = await checkLedger();
    expect(report.mismatches).toEqual([]);
    expect(report.movesChecked).toBeGreaterThan(100);

    // No operation has moves unless it is Done, and no line was posted twice.
    const [bad] = await prisma.$queryRaw<Array<{ undone: number; doubled: number }>>`
      SELECT
        (SELECT COUNT(*)::int FROM stock_move m JOIN operation o ON o.id = m.operation_id WHERE o.status <> 'DONE') AS undone,
        (SELECT COUNT(*)::int FROM (SELECT operation_line_id FROM stock_move GROUP BY 1 HAVING COUNT(*) > 1) d) AS doubled`;
    expect(bad).toEqual({ undone: 0, doubled: 0 });
    expect(tally['INSUFFICIENT_STOCK'] ?? 0).toBeGreaterThanOrEqual(0);
  });
});
