/** Parallel requests against the real database: the lock protocol, not mocks, is what's under test. */
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma, txStats } from '../src/lib/db';
import { AppError } from '../src/lib/errors';
import { checkLedger } from '../src/inventory/integrity';
import { runAction } from '../src/operations/service';
import {
  act, ADJUST, balance, draft, makeLocation, makeProduct, makeUser, makeWarehouse, moveCount,
  readyDelivery, receive, resetDb, VENDORS,
} from './factories';

beforeEach(resetDb);

const settle = <T>(ps: Promise<T>[]) => Promise.allSettled(ps);
const codeOf = (r: PromiseSettledResult<unknown> | undefined) =>
  !r ? "MISSING" :
  r.status === 'fulfilled' ? 'OK' : r.reason instanceof AppError ? r.reason.code : String(r.reason);

describe('concurrency', () => {
  // Rule 4
  it('two parallel validations of one delivery post exactly one set of moves', async () => {
    const mgr = await makeUser();
    const other = await makeUser();
    const { stock } = await makeWarehouse();
    const p = await makeProduct();
    await receive(mgr, p.id, stock.id, '10');

    // Two different users: one 200, one 409.
    const d1 = await readyDelivery(mgr, stock.id, [{ productId: p.id, quantity: '3' }]);
    const r1 = await settle([
      runAction(mgr, d1.id, 'validate', { version: d1.version }),
      runAction(other, d1.id, 'validate', { version: d1.version }),
    ]);
    expect(r1.map(codeOf).sort()).toEqual(['INVALID_TRANSITION', 'OK']);
    expect(await moveCount(d1.id)).toBe(1);

    // The same user twice (a retry racing the original): both 200, one of them a replay.
    const d2 = await readyDelivery(mgr, stock.id, [{ productId: p.id, quantity: '3' }]);
    const r2 = await Promise.all([
      runAction(mgr, d2.id, 'validate', { version: d2.version }),
      runAction(mgr, d2.id, 'validate', { version: d2.version }),
    ]);
    expect(r2.filter((r) => r.replayed)).toHaveLength(1);
    expect(await moveCount(d2.id)).toBe(1);
    expect(await balance(p.id, stock.id)).toBe('4.000');
  });

  // Rule 5
  it('two deliveries competing for the same stock: one wins, the other gets INSUFFICIENT_STOCK', async () => {
    const mgr = await makeUser();
    const { stock } = await makeWarehouse();
    const p = await makeProduct();
    await receive(mgr, p.id, stock.id, '10');
    const a = await readyDelivery(mgr, stock.id, [{ productId: p.id, quantity: '7' }]);
    const b = await readyDelivery(mgr, stock.id, [{ productId: p.id, quantity: '7' }]);
    expect([a.status, b.status]).toEqual(['READY', 'READY']);

    const results = await settle([
      runAction(mgr, a.id, 'validate', { version: a.version }),
      runAction(mgr, b.id, 'validate', { version: b.version }),
    ]);
    expect(results.map(codeOf).sort()).toEqual(['INSUFFICIENT_STOCK', 'OK']);
    expect(await balance(p.id, stock.id)).toBe('3.000');
    const loser = results[0]!.status === 'rejected' ? a : b;
    expect((await prisma.operation.findUniqueOrThrow({ where: { id: loser.id } })).status).toBe('READY');
  });

  // Rule 6
  it('opposite transfers in parallel never deadlock and keep totals unchanged', async () => {
    const mgr = await makeUser();
    const { stock: a, warehouse } = await makeWarehouse();
    const b = await makeLocation(warehouse.id);
    const ps = [await makeProduct(), await makeProduct(), await makeProduct()];
    for (const p of ps) {
      await receive(mgr, p.id, a.id, '100');
      await receive(mgr, p.id, b.id, '100');
    }
    const lines = ps.map((p) => ({ productId: p.id, quantity: '1' }));
    const ops = [];
    for (let i = 0; i < 20; i++) {
      for (const [from, to] of [[a.id, b.id], [b.id, a.id]] as const) {
        const op = await draft(mgr, 'TRANSFER', from, to, lines);
        await act(mgr, op.id, 'confirm');
        ops.push(op.id);
      }
    }
    const retriesBefore = txStats.retries;
    const results = await settle(ops.map((id) => runAction(mgr, id, 'validate', { version: 1 })));
    expect(results.map(codeOf).filter((c) => c !== 'OK')).toEqual([]);
    // The sorted lock order means Postgres never even reports a deadlock for the wrapper to retry.
    expect(txStats.retries - retriesBefore).toBe(0);
    for (const p of ps) {
      expect(await balance(p.id, a.id)).toBe('100.000');
      expect(await balance(p.id, b.id)).toBe('100.000');
    }
    expect((await checkLedger()).ok).toBe(true);
  });

  // Rule 7
  it('a first count racing a first receipt never doubles stock', async () => {
    const mgr = await makeUser();
    const { stock } = await makeWarehouse();
    const outcomes = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const p = await makeProduct();
      const count = await draft(mgr, 'ADJUSTMENT', ADJUST, stock.id, [{ productId: p.id, countedQuantity: '5' }]);
      const receipt = await draft(mgr, 'RECEIPT', VENDORS, stock.id, [{ productId: p.id, quantity: '3' }]);
      const [c, r] = await settle([
        runAction(mgr, count.id, 'validate', { version: 0 }),
        runAction(mgr, receipt.id, 'validate', { version: 0 }),
      ]);
      expect(codeOf(r)).toBe('OK');
      const final = await balance(p.id, stock.id);
      if (codeOf(c) === 'OK') {
        // The count landed first (5), then the receipt added 3.
        expect(final).toBe('8.000');
        outcomes.add('count-first');
      } else {
        expect(codeOf(c)).toBe('BALANCE_CHANGED');
        expect(final).toBe('3.000');
        outcomes.add('receipt-first');
      }
    }
    expect(outcomes.size).toBeGreaterThan(0);
    expect((await checkLedger()).ok).toBe(true);
  });
});
