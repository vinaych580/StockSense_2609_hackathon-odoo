import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/db';
import { ids, seedMaster } from '../../src/seed/master';
import { seedStock } from '../../src/seed/stock';
import { act, CUSTOMERS, draft, makeProduct, makeWarehouse, receive, resetDb, VENDORS } from '../factories';
import { signedIn } from './helpers';

const skus = (alerts: Array<{ sku: string }>) => alerts.map((a) => a.sku);

describe('GET /dashboard on the demo seed', () => {
  beforeAll(async () => {
    await resetDb();
    await seedMaster(prisma);
    await seedStock();
  }, 120_000);

  it('shows 22 in stock, 3 low and 2 out, as the seed promises', async () => {
    const { agent } = await signedIn('STAFF');
    const res = await agent.get('/api/v1/dashboard');
    expect(res.status).toBe(200);
    const { kpis, alerts } = res.body.data;
    expect(kpis).toMatchObject({ productsInStock: 22, lowStock: 3, outOfStock: 2 });
    expect(skus(alerts.filter((a: { status: string }) => a.status === 'low'))).toEqual(['BX-30', 'KB-21', 'PT-40']);
    expect(skus(alerts.filter((a: { status: string }) => a.status === 'out'))).toEqual(['CH-24', 'GL-41']);

    // Open documents, with the mockup's late and waiting sub-counts.
    const open = await prisma.operation.groupBy({ by: ['type'], where: { status: { in: ['DRAFT', 'WAITING', 'READY'] } }, _count: { _all: true } });
    const n = (t: string) => open.find((o) => o.type === t)?._count._all ?? 0;
    expect(kpis.pendingReceipts.total).toBe(n('RECEIPT'));
    expect(kpis.pendingDeliveries.total).toBe(n('DELIVERY'));
    expect(kpis.scheduledTransfers.total).toBe(n('TRANSFER'));
    expect(kpis.pendingDeliveries.waiting).toBe(await prisma.operation.count({ where: { type: 'DELIVERY', status: 'WAITING' } }));
    const late = (await agent.get('/api/v1/operations?type=DELIVERY&late=true')).body.page.total;
    expect(kpis.pendingDeliveries.late).toBe(late);
    expect(kpis.pendingReceipts.total + kpis.pendingDeliveries.total).toBeGreaterThan(0);

    // A low alert carries its rule and the quantity that brings it back to max.
    const keyboard = alerts.find((a: { sku: string }) => a.sku === 'KB-21');
    expect(keyboard.rules[0]).toMatchObject({ warehouseCode: 'WH1', minQty: '10.000', maxQty: '40.000' });
    expect(Number(keyboard.rules[0].suggestedQty)).toBe(40 - Number(keyboard.rules[0].onHand));
  });

  it('agrees with GET /products?stockStatus=, and filters by category and warehouse', async () => {
    const { agent } = await signedIn('STAFF');
    const low = (await agent.get('/api/v1/products?stockStatus=low')).body;
    expect(skus(low.data)).toEqual(['BX-30', 'KB-21', 'PT-40']);
    expect(low.data.every((p: { stockStatus: string }) => p.stockStatus === 'low')).toBe(true);
    expect((await agent.get('/api/v1/products?stockStatus=low,out')).body.page.total).toBe(5);

    const electronics = (await agent.get(`/api/v1/dashboard?categoryId=${ids.category('Electronics')}`)).body.data;
    expect(electronics.kpis).toMatchObject({ lowStock: 1, outOfStock: 1 });

    // WH2 counts only products WH2 carries, not every product it never stocked.
    const wh2 = (await agent.get(`/api/v1/dashboard?warehouseId=${ids.warehouse('WH2')}`)).body.data.kpis;
    const carried = await prisma.product.count({
      where: {
        isActive: true,
        OR: [{ reorderRules: { some: { warehouseId: ids.warehouse('WH2') } } }, { quants: { some: { location: { warehouseId: ids.warehouse('WH2') } } } }],
      },
    });
    expect(wh2.productsInStock + wh2.outOfStock).toBe(carried);
    expect(wh2.outOfStock).toBeLessThan(5);
  });

  it('gives Managers the ledger integrity proof', async () => {
    const staff = await signedIn('STAFF');
    expect((await staff.agent.get('/api/v1/dashboard/integrity')).status).toBe(403);
    const mgr = await signedIn('MANAGER');
    const res = await mgr.agent.get('/api/v1/dashboard/integrity');
    expect(res.body.data).toMatchObject({ ok: true, mismatches: [] });
    expect(res.body.data.movesChecked).toBeGreaterThan(0);
  });
});

describe('stock health rules', () => {
  beforeEach(resetDb);

  it('counts low per rule warehouse and treats an empty rule warehouse as low when stock sits elsewhere', async () => {
    const { agent, user } = await signedIn('MANAGER');
    const actor = { id: user.id, name: user.name, role: user.role };
    const wh1 = await makeWarehouse('WH1');
    const wh2 = await makeWarehouse('WH2');
    const p = await makeProduct({ sku: 'P-1' });
    await prisma.reorderRule.create({ data: { productId: p.id, warehouseId: wh1.warehouse.id, minQty: 5, maxQty: 20 } });
    await receive(actor, p.id, wh2.stock.id, '50');

    const all = (await agent.get('/api/v1/dashboard')).body.data;
    expect(all.kpis).toMatchObject({ productsInStock: 1, lowStock: 1, outOfStock: 0 });
    expect(all.alerts[0].rules[0]).toMatchObject({ warehouseCode: 'WH1', onHand: '0.000', suggestedQty: '20.000' });

    // In WH1 alone it has nothing: out. In WH2 alone it is fine (the WH1 rule is out of scope).
    expect((await agent.get(`/api/v1/dashboard?warehouseId=${wh1.warehouse.id}`)).body.data.kpis).toMatchObject({ productsInStock: 0, outOfStock: 1 });
    expect((await agent.get(`/api/v1/dashboard?warehouseId=${wh2.warehouse.id}`)).body.data.kpis).toMatchObject({ productsInStock: 1, lowStock: 0 });
  });

  it('counts a WH1 → WH2 transfer under both warehouses, and archived products nowhere', async () => {
    const { agent, user } = await signedIn('MANAGER');
    const actor = { id: user.id, name: user.name, role: user.role };
    const wh1 = await makeWarehouse('WH1');
    const wh2 = await makeWarehouse('WH2');
    const p = await makeProduct();
    await receive(actor, p.id, wh1.stock.id, '5');
    await draft(actor, 'TRANSFER', wh1.stock.id, wh2.stock.id, [{ productId: p.id, quantity: '2' }]);
    const late = await draft(actor, 'RECEIPT', VENDORS, wh1.stock.id, [{ productId: p.id, quantity: '1' }]);
    await prisma.operation.update({ where: { id: late.id }, data: { scheduledDate: new Date(Date.now() - 3 * 86400_000) } });
    const out = await draft(actor, 'DELIVERY', wh1.stock.id, CUSTOMERS, [{ productId: p.id, quantity: '9' }]);
    await act(actor, out.id, 'confirm');

    const k = (await agent.get('/api/v1/dashboard')).body.data.kpis;
    expect(k.pendingReceipts).toEqual({ total: 1, late: 1 });
    expect(k.pendingDeliveries).toEqual({ total: 1, late: 0, waiting: 1 });
    for (const w of [wh1, wh2]) {
      expect((await agent.get(`/api/v1/dashboard?warehouseId=${w.warehouse.id}`)).body.data.kpis.scheduledTransfers.total).toBe(1);
    }

    const gone = await makeProduct();
    await prisma.product.update({ where: { id: gone.id }, data: { isActive: false } });
    expect((await agent.get('/api/v1/dashboard')).body.data.kpis.outOfStock).toBe(0);
  });

  it('narrows document counts to a location, matching either end', async () => {
    const { agent, user } = await signedIn('MANAGER');
    const actor = { id: user.id, name: user.name, role: user.role };
    const wh1 = await makeWarehouse('WH1');
    const wh2 = await makeWarehouse('WH2');
    const p = await makeProduct();
    await receive(actor, p.id, wh1.stock.id, '5');
    await draft(actor, 'TRANSFER', wh1.stock.id, wh2.stock.id, [{ productId: p.id, quantity: '2' }]);
    await draft(actor, 'RECEIPT', VENDORS, wh1.stock.id, [{ productId: p.id, quantity: '1' }]);

    const at = async (id: string) => (await agent.get(`/api/v1/dashboard?locationId=${id}`)).body.data;
    const atWh2 = await at(wh2.stock.id);
    expect(atWh2.filters.locationId).toBe(wh2.stock.id);
    expect(atWh2.kpis.scheduledTransfers.total).toBe(1);
    expect(atWh2.kpis.pendingReceipts.total).toBe(0);
    expect((await at(wh1.stock.id)).kpis).toMatchObject({ pendingReceipts: { total: 1 }, scheduledTransfers: { total: 1 } });
  });
});
