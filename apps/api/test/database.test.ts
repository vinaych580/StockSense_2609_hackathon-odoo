/** Rule 14 and the database-level backstops. */
import { beforeEach, describe, expect, it } from 'vitest';
import { SYSTEM_LOCATION_IDS } from '@stocksense/shared';
import { prisma } from '../src/lib/db';
import { ensureSystemData } from '../src/system/ensure-system-data';
import { makeProduct, makeUser, makeWarehouse, receive, resetDb } from './factories';

beforeEach(resetDb);

describe('database guards', () => {
  it('rejects UPDATE and DELETE on the append-only ledger', async () => {
    const mgr = await makeUser();
    const { stock } = await makeWarehouse();
    const p = await makeProduct();
    await receive(mgr, p.id, stock.id, '5');
    await expect(prisma.$executeRaw`UPDATE stock_move SET quantity = 50`).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRaw`DELETE FROM stock_move`).rejects.toThrow(/append-only/);
    expect(await prisma.stockMove.count()).toBe(1);
  });

  it('CHECK stops negative stock even if a service had a bug', async () => {
    const mgr = await makeUser();
    const { stock } = await makeWarehouse();
    const p = await makeProduct();
    await receive(mgr, p.id, stock.id, '5');
    await expect(prisma.$executeRaw`UPDATE stock_quant SET quantity = -1`).rejects.toThrow(/stock_quant_quantity_nonneg/);
  });

  it('allows only one location per virtual type, and virtual locations have no warehouse', async () => {
    await expect(prisma.location.create({ data: { code: 'V2', name: 'Vendors 2', type: 'VENDOR' } })).rejects.toThrow();
    const { warehouse } = await makeWarehouse();
    await expect(
      prisma.location.create({ data: { code: 'C2', name: 'Customers 2', type: 'CUSTOMER', warehouseId: warehouse.id } }),
    ).rejects.toThrow(/location_warehouse_matches_type/);
  });

  it('ensureSystemData restores the virtual locations after a truncate', async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "location" CASCADE');
    expect(await prisma.location.count()).toBe(0);
    await ensureSystemData(prisma);
    await ensureSystemData(prisma); // idempotent
    const ids = (await prisma.location.findMany({ orderBy: { id: 'asc' } })).map((l) => l.id);
    expect(ids).toEqual(Object.values(SYSTEM_LOCATION_IDS).sort());
  });
});
