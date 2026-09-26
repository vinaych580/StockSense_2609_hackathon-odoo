import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/db';
import { checkLedger } from '../src/inventory/integrity';
import { createOperation, runAction, updateOperation } from '../src/operations/service';
import { getOperation } from '../src/operations/dto';
import {
  act, ADJUST, balance, caught, CUSTOMERS, draft, errorCode, makeLocation, makePartner, makeProduct,
  makeUser, makeWarehouse, moveCount, readyDelivery, receive, resetDb, VENDORS,
} from './factories';

beforeEach(resetDb);

describe('receipts', () => {
  // Rule 1
  it('validating a receipt from Draft confirms and posts in one step, one move per line', async () => {
    const mgr = await makeUser();
    const { stock } = await makeWarehouse('WH1');
    const [a, b] = [await makeProduct(), await makeProduct({ uom: 'KG' })];
    const op = await draft(mgr, 'RECEIPT', VENDORS, stock.id, [
      { productId: a.id, quantity: '5' },
      { productId: b.id, quantity: '12.5' },
    ]);
    expect(op.reference).toBe('WH1/IN/00001');
    expect(op.status).toBe('DRAFT');

    const { operation, posted } = await act(mgr, op.id, 'validate');
    expect(operation.status).toBe('DONE');
    expect(operation.validatedBy?.id).toBe(mgr.id);
    expect(posted?.movesPosted).toBe(2);
    expect(await balance(a.id, stock.id)).toBe('5.000');
    expect(await balance(b.id, stock.id)).toBe('12.500');
    expect(await moveCount(op.id)).toBe(2);
    expect((await checkLedger()).ok).toBe(true);
  });

  it('numbers references per warehouse and type without gaps', async () => {
    const mgr = await makeUser();
    const { stock } = await makeWarehouse('WH1');
    const p = await makeProduct();
    const r1 = await draft(mgr, 'RECEIPT', VENDORS, stock.id, [{ productId: p.id, quantity: '1' }]);
    const r2 = await draft(mgr, 'RECEIPT', VENDORS, stock.id, [{ productId: p.id, quantity: '1' }]);
    const t = await draft(mgr, 'TRANSFER', stock.id, (await makeLocation(stock.warehouseId!)).id, [{ productId: p.id, quantity: '1' }]);
    expect([r1.reference, r2.reference, t.reference]).toEqual(['WH1/IN/00001', 'WH1/IN/00002', 'WH1/INT/00001']);
  });

  it('rejects a receipt into a virtual location and a supplier used as a customer', async () => {
    const mgr = await makeUser();
    const { stock } = await makeWarehouse();
    const p = await makeProduct();
    expect(await errorCode(draft(mgr, 'RECEIPT', VENDORS, CUSTOMERS, [{ productId: p.id, quantity: '1' }]))).toBe(
      'INVALID_LOCATION_FOR_TYPE',
    );
    const supplier = await makePartner('SUPPLIER');
    const e = await caught(
      createOperation(mgr, {
        type: 'DELIVERY', sourceLocationId: stock.id, destLocationId: CUSTOMERS, partnerId: supplier.id,
        lines: [{ productId: p.id, quantity: '1' }],
      }),
    );
    expect(e.code).toBe('VALIDATION_FAILED');
  });

  it('enforces the unit of measure precision', async () => {
    const mgr = await makeUser();
    const { stock } = await makeWarehouse();
    const chair = await makeProduct({ uom: 'UNIT' });
    expect(await errorCode(draft(mgr, 'RECEIPT', VENDORS, stock.id, [{ productId: chair.id, quantity: '1.5' }]))).toBe('UOM_PRECISION');
  });
});

describe('deliveries', () => {
  // Rule 2
  it('a short delivery returns 409 listing every short line and changes nothing', async () => {
    const mgr = await makeUser();
    const { stock } = await makeWarehouse('WH1');
    const [a, b] = [await makeProduct({ name: 'Office Chair' }), await makeProduct({ name: 'Desk' })];
    await receive(mgr, a.id, stock.id, '10');
    await receive(mgr, b.id, stock.id, '1');
    const op = await readyDelivery(mgr, stock.id, [
      { productId: a.id, quantity: '10' },
      { productId: b.id, quantity: '1' },
    ]);
    expect(op.status).toBe('READY');
    // Stock drops after the delivery went Ready (no reservation): a count finds only 4 chairs.
    await countAndPost(mgr, stock.id, a.id, '4');
    const before = await prisma.operation.findUniqueOrThrow({ where: { id: op.id } });

    const e = await caught(act(mgr, op.id, 'validate'));
    expect(e.code).toBe('INSUFFICIENT_STOCK');
    expect(e.message).toContain('Office Chair needs 10 at WH1/Stock, only 4 available');
    expect(e.details).toEqual([expect.objectContaining({ productId: a.id, requested: '10.000', available: '4.000' })]);

    const after = await prisma.operation.findUniqueOrThrow({ where: { id: op.id } });
    expect(after.status).toBe('READY');
    expect(after.version).toBe(before.version);
    expect(await balance(a.id, stock.id)).toBe('4.000');
    expect(await moveCount(op.id)).toBe(0);
  });

  // Rule 3
  it('rolls back lines 1 and 2 when line 3 is short', async () => {
    const mgr = await makeUser();
    const { stock } = await makeWarehouse();
    const ps = [await makeProduct(), await makeProduct(), await makeProduct()];
    await receive(mgr, ps[0]!.id, stock.id, '10');
    await receive(mgr, ps[1]!.id, stock.id, '10');
    await receive(mgr, ps[2]!.id, stock.id, '5');
    const op = await readyDelivery(mgr, stock.id, ps.map((p) => ({ productId: p.id, quantity: '5' })));
    await countAndPost(mgr, stock.id, ps[2]!.id, '1');

    const e = await caught(act(mgr, op.id, 'validate'));
    expect(e.code).toBe('INSUFFICIENT_STOCK');
    expect(await balance(ps[0]!.id, stock.id)).toBe('10.000');
    expect(await balance(ps[1]!.id, stock.id)).toBe('10.000');
    expect(await moveCount(op.id)).toBe(0);
  });

  it('needs pick then pack before validate, and un-picking clears packed', async () => {
    const mgr = await makeUser();
    const staff = await makeUser('STAFF');
    const { stock } = await makeWarehouse();
    const p = await makeProduct();
    await receive(mgr, p.id, stock.id, '5');
    const op = await draft(mgr, 'DELIVERY', stock.id, CUSTOMERS, [{ productId: p.id, quantity: '2' }]);
    await act(mgr, op.id, 'confirm');
    expect(await errorCode(act(mgr, op.id, 'validate'))).toBe('NOT_READY');
    expect(await errorCode(act(staff, op.id, 'pack'))).toBe('NOT_READY');
    await act(staff, op.id, 'pick');
    await act(staff, op.id, 'pack');
    const unpicked = await act(staff, op.id, 'unpick');
    expect(unpicked.operation.packedAt).toBeNull();
    await act(staff, op.id, 'pick');
    await act(staff, op.id, 'pack');
    expect(await errorCode(act(staff, op.id, 'validate'))).toBe('FORBIDDEN');
    const done = await act(mgr, op.id, 'validate');
    expect(done.operation.status).toBe('DONE');
    expect(await balance(p.id, stock.id)).toBe('3.000');
  });

  it('shows the gap on short lines while the document is open', async () => {
    const mgr = await makeUser();
    const { stock } = await makeWarehouse();
    const p = await makeProduct();
    await receive(mgr, p.id, stock.id, '4');
    const op = await draft(mgr, 'DELIVERY', stock.id, CUSTOMERS, [{ productId: p.id, quantity: '10' }]);
    const dto = await getOperation(op.id);
    expect(dto.lines[0]).toMatchObject({ onHand: '4.000', shortBy: '6.000' });
  });
});

describe('transfers', () => {
  it('moves stock between warehouses and leaves the total unchanged', async () => {
    const mgr = await makeUser();
    const wh1 = await makeWarehouse('WH1');
    const wh2 = await makeWarehouse('WH2');
    const p = await makeProduct({ uom: 'KG' });
    await receive(mgr, p.id, wh1.stock.id, '100');
    const op = await draft(mgr, 'TRANSFER', wh1.stock.id, wh2.stock.id, [{ productId: p.id, quantity: '40' }]);
    await act(mgr, op.id, 'confirm');
    const { posted } = await act(mgr, op.id, 'validate');
    expect(await balance(p.id, wh1.stock.id)).toBe('60.000');
    expect(await balance(p.id, wh2.stock.id)).toBe('40.000');
    expect(posted?.warehouseIds.sort()).toEqual([wh1.warehouse.id, wh2.warehouse.id].sort());
    expect((await checkLedger()).ok).toBe(true);
  });

  it('cannot validate a transfer from Draft', async () => {
    const mgr = await makeUser();
    const { stock, warehouse } = await makeWarehouse();
    const rack = await makeLocation(warehouse.id);
    const p = await makeProduct();
    const op = await draft(mgr, 'TRANSFER', stock.id, rack.id, [{ productId: p.id, quantity: '1' }]);
    expect(await errorCode(act(mgr, op.id, 'validate'))).toBe('INVALID_TRANSITION');
  });
});

describe('adjustments', () => {
  it('posts the difference in the right direction, and nothing for an exact count', async () => {
    const mgr = await makeUser();
    const { stock } = await makeWarehouse();
    const [up, down, same] = [await makeProduct(), await makeProduct(), await makeProduct()];
    await receive(mgr, down.id, stock.id, '10');
    await receive(mgr, same.id, stock.id, '3');
    const op = await draft(mgr, 'ADJUSTMENT', ADJUST, stock.id, [
      { productId: up.id, countedQuantity: '4' },
      { productId: down.id, countedQuantity: '7' },
      { productId: same.id, countedQuantity: '3' },
    ]);
    const { posted } = await act(mgr, op.id, 'validate');
    expect(posted).toMatchObject({ movesPosted: 2, unchangedLines: 1 });
    expect(await balance(up.id, stock.id)).toBe('4.000');
    expect(await balance(down.id, stock.id)).toBe('7.000');
    const moves = await prisma.stockMove.findMany({ where: { operationId: op.id } });
    expect(moves.find((m) => m.productId === up.id)).toMatchObject({ fromLocationId: ADJUST, toLocationId: stock.id });
    expect(moves.find((m) => m.productId === down.id)).toMatchObject({ fromLocationId: stock.id, toLocationId: ADJUST });
    const lines = await prisma.operationLine.findMany({ where: { operationId: op.id } });
    expect(lines.find((l) => l.productId === down.id)?.postedQuantity?.toFixed(3)).toBe('-3.000');
  });

  // Rule 8
  it('returns BALANCE_CHANGED when stock moved since counting, and posts counted − current when acknowledged', async () => {
    const mgr = await makeUser();
    const { stock } = await makeWarehouse();
    const p = await makeProduct();
    await receive(mgr, p.id, stock.id, '10');
    const count = await draft(mgr, 'ADJUSTMENT', ADJUST, stock.id, [{ productId: p.id, countedQuantity: '8' }]);
    await receive(mgr, p.id, stock.id, '5'); // balance is now 15, counted against 10

    const e = await caught(act(mgr, count.id, 'validate'));
    expect(e.code).toBe('BALANCE_CHANGED');
    expect(e.details).toEqual([expect.objectContaining({ balanceAtCount: '10.000', currentBalance: '15.000', counted: '8.000' })]);
    expect(await balance(p.id, stock.id)).toBe('15.000');

    const { posted } = await act(mgr, count.id, 'validate', { acknowledgeBalanceChange: true });
    expect(posted?.movesPosted).toBe(1);
    expect(await balance(p.id, stock.id)).toBe('8.000');
  });

  it('re-snapshots the balance when a count is edited', async () => {
    const mgr = await makeUser();
    const { stock } = await makeWarehouse();
    const p = await makeProduct();
    await receive(mgr, p.id, stock.id, '10');
    const count = await draft(mgr, 'ADJUSTMENT', ADJUST, stock.id, [{ productId: p.id, countedQuantity: '8' }]);
    await receive(mgr, p.id, stock.id, '5');
    const edited = await updateOperation(mgr, count.id, {
      sourceLocationId: ADJUST, destLocationId: stock.id, version: 0,
      lines: [{ productId: p.id, countedQuantity: '14' }],
    });
    expect(edited.lines[0]).toMatchObject({ balanceAtCount: '15.000', countedQuantity: '14.000' });
    await act(mgr, count.id, 'validate');
    expect(await balance(p.id, stock.id)).toBe('14.000');
  });
});

describe('state machine', () => {
  // Rule 10
  it('rejects invalid transitions with 409', async () => {
    const mgr = await makeUser();
    const { stock } = await makeWarehouse();
    const p = await makeProduct();
    await receive(mgr, p.id, stock.id, '5');
    const delivery = await draft(mgr, 'DELIVERY', stock.id, CUSTOMERS, [{ productId: p.id, quantity: '1' }]);
    expect(await errorCode(act(mgr, delivery.id, 'validate'))).toBe('INVALID_TRANSITION');

    await act(mgr, delivery.id, 'cancel');
    expect(await errorCode(act(mgr, delivery.id, 'validate'))).toBe('INVALID_TRANSITION');
    expect(await errorCode(act(mgr, delivery.id, 'confirm'))).toBe('INVALID_TRANSITION');

    const receipt = await receive(mgr, p.id, stock.id, '1');
    const e = await caught(act(mgr, receipt.operation.id, 'cancel'));
    expect(e.code).toBe('INVALID_TRANSITION');
    expect(e.message).toMatch(/^Already validated by Manager \d+ at \d\d:\d\d$/);
  });

  it('a repeat validate by the same user is a 200 replay; by someone else it is a 409', async () => {
    const mgr = await makeUser();
    const other = await makeUser();
    const { stock } = await makeWarehouse();
    const p = await makeProduct();
    const r = await receive(mgr, p.id, stock.id, '5');
    const replay = await runAction(mgr, r.operation.id, 'validate', { version: 0 });
    expect(replay.replayed).toBe(true);
    expect(await moveCount(r.operation.id)).toBe(1);
    expect(await errorCode(runAction(other, r.operation.id, 'validate', { version: 0 }))).toBe('INVALID_TRANSITION');
  });

  // Rule 11
  it('a stale version returns 409 STALE_VERSION', async () => {
    const mgr = await makeUser();
    const { stock } = await makeWarehouse();
    const p = await makeProduct();
    const op = await draft(mgr, 'RECEIPT', VENDORS, stock.id, [{ productId: p.id, quantity: '1' }]);
    await act(mgr, op.id, 'confirm'); // version 0 → 1
    expect(await errorCode(runAction(mgr, op.id, 'validate', { version: 0 }))).toBe('STALE_VERSION');

    const d = await draft(mgr, 'RECEIPT', VENDORS, stock.id, [{ productId: p.id, quantity: '1' }]);
    const edit = { sourceLocationId: VENDORS, destLocationId: stock.id, version: 0, lines: [{ productId: p.id, quantity: '2' }] };
    await updateOperation(mgr, d.id, edit); // version 0 → 1
    expect(await errorCode(updateOperation(mgr, d.id, edit))).toBe('STALE_VERSION');
  });

  it('every transition bumps the version, and back to draft clears pick and pack', async () => {
    const mgr = await makeUser();
    const { stock } = await makeWarehouse();
    const p = await makeProduct();
    await receive(mgr, p.id, stock.id, '5');
    const op = await readyDelivery(mgr, stock.id, [{ productId: p.id, quantity: '1' }]);
    expect(op.version).toBe(3);
    const reset = await act(mgr, op.id, 'reset-to-draft');
    expect(reset.operation).toMatchObject({ status: 'DRAFT', version: 4, pickedAt: null, packedAt: null });
  });

  it('refuses to confirm or validate with an archived product', async () => {
    const mgr = await makeUser();
    const { stock } = await makeWarehouse();
    const p = await makeProduct();
    const op = await draft(mgr, 'RECEIPT', VENDORS, stock.id, [{ productId: p.id, quantity: '1' }]);
    await prisma.product.update({ where: { id: p.id }, data: { isActive: false } });
    expect(await errorCode(act(mgr, op.id, 'confirm'))).toBe('INACTIVE_REFERENCE');
    expect(await errorCode(act(mgr, op.id, 'validate'))).toBe('INACTIVE_REFERENCE');
  });
});

describe('permissions', () => {
  // Rule 12
  it('Staff get 403 creating a receipt or validating an adjustment, whatever the request claims', async () => {
    const mgr = await makeUser();
    const staff = await makeUser('STAFF');
    const { stock } = await makeWarehouse();
    const p = await makeProduct();
    expect(await errorCode(draft(staff, 'RECEIPT', VENDORS, stock.id, [{ productId: p.id, quantity: '1' }]))).toBe('FORBIDDEN');

    const adj = await draft(staff, 'ADJUSTMENT', ADJUST, stock.id, [{ productId: p.id, countedQuantity: '3' }]);
    await act(staff, adj.id, 'confirm');
    // The action input has no type; extra fields (as a crafted body would carry) are ignored.
    const crafted = { version: 1, type: 'TRANSFER' } as unknown as { version: number };
    expect(await errorCode(runAction(staff, adj.id, 'validate', crafted))).toBe('FORBIDDEN');
    expect((await act(mgr, adj.id, 'validate')).operation.status).toBe('DONE');
  });

  it('Staff can receive goods (validate a receipt) that a Manager planned', async () => {
    const mgr = await makeUser();
    const staff = await makeUser('STAFF');
    const { stock } = await makeWarehouse();
    const p = await makeProduct();
    const op = await draft(mgr, 'RECEIPT', VENDORS, stock.id, [{ productId: p.id, quantity: '2' }]);
    expect((await act(staff, op.id, 'validate')).operation.status).toBe('DONE');
  });
});

/** A Manager's quick count, validated at once. */
async function countAndPost(mgr: Parameters<typeof act>[0], locationId: string, productId: string, counted: string) {
  const adj = await draft(mgr, 'ADJUSTMENT', ADJUST, locationId, [{ productId, countedQuantity: counted }]);
  return act(mgr, adj.id, 'validate');
}
