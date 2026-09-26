import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/db';
import { act, ADJUST, CUSTOMERS, draft, makeLocation, makeProduct, makeWarehouse, receive, resetDb, VENDORS } from '../factories';
import { signedIn } from './helpers';

beforeEach(resetDb);

async function setup() {
  const { agent, user } = await signedIn('MANAGER');
  const actor = { id: user.id, name: user.name, role: user.role };
  const { warehouse, stock } = await makeWarehouse('WH1');
  const rack = await makeLocation(warehouse.id, 'Rack A');
  const wh2 = await makeWarehouse('WH2');
  const chair = await makeProduct({ sku: 'CH-01', name: 'Office Chair' });
  const rods = await makeProduct({ sku: 'SR-01', name: 'Steel Rods', uom: 'KG' });
  return { agent, actor, warehouse, stock, rack, wh2, chair, rods };
}

describe('GET /stock', () => {
  it('lists balances per product and location, with free to use and forecast from confirmed documents', async () => {
    const { agent, actor, stock, rack, chair } = await setup();
    await receive(actor, chair.id, stock.id, '10');
    // Confirmed outgoing 4 from Stock, confirmed incoming 3 into Stock; a Draft counts for neither.
    const out = await draft(actor, 'DELIVERY', stock.id, CUSTOMERS, [{ productId: chair.id, quantity: '4' }]);
    await act(actor, out.id, 'confirm');
    const inc = await draft(actor, 'RECEIPT', VENDORS, stock.id, [{ productId: chair.id, quantity: '3' }]);
    await act(actor, inc.id, 'confirm');
    await draft(actor, 'TRANSFER', stock.id, rack.id, [{ productId: chair.id, quantity: '2' }]);

    const res = await agent.get('/api/v1/stock');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({
        product: expect.objectContaining({ id: chair.id, sku: 'CH-01', uom: 'UNIT' }),
        location: expect.objectContaining({ id: stock.id, label: 'WH1/Stock' }),
        onHand: '10.000',
        outgoing: '4.000',
        incoming: '3.000',
        freeToUse: '6.000',
        forecast: '9.000',
      }),
    ]);
    expect(res.body.page.total).toBe(1);
  });

  it('filters by warehouse, location, product and search', async () => {
    const { agent, actor, stock, rack, wh2, chair, rods } = await setup();
    await receive(actor, chair.id, stock.id, '5');
    await receive(actor, rods.id, rack.id, '12.5');
    await receive(actor, chair.id, wh2.stock.id, '1');
    const count = async (q: string) => (await agent.get(`/api/v1/stock?${q}`)).body.page.total;
    expect(await count('')).toBe(3);
    expect(await count(`warehouseId=${wh2.warehouse.id}`)).toBe(1);
    expect(await count(`locationId=${rack.id}`)).toBe(1);
    expect(await count(`productId=${chair.id}`)).toBe(2);
    expect(await count('search=steel')).toBe(1);
    expect(await count('search=sr-01')).toBe(1);
  });

  it('hides zero balances unless asked', async () => {
    const { agent, actor, stock, chair } = await setup();
    await receive(actor, chair.id, stock.id, '2');
    const out = await draft(actor, 'TRANSFER', stock.id, (await makeLocation(stock.warehouseId!)).id, [{ productId: chair.id, quantity: '2' }]);
    await act(actor, out.id, 'confirm');
    await act(actor, out.id, 'validate');
    expect((await agent.get('/api/v1/stock')).body.page.total).toBe(1);
    expect((await agent.get('/api/v1/stock?includeZero=true')).body.page.total).toBe(2);
  });
});

describe('GET /moves', () => {
  it('lists the ledger newest first with reference, direction and who did it', async () => {
    const { agent, actor, stock, rack, rods } = await setup();
    await receive(actor, rods.id, stock.id, '100');
    const t = await draft(actor, 'TRANSFER', stock.id, rack.id, [{ productId: rods.id, quantity: '30' }]);
    await act(actor, t.id, 'confirm');
    await act(actor, t.id, 'validate');
    const adj = await draft(actor, 'ADJUSTMENT', ADJUST, rack.id, [{ productId: rods.id, countedQuantity: '27' }]);
    await act(actor, adj.id, 'validate');

    const res = await agent.get('/api/v1/moves');
    expect(res.status).toBe(200);
    expect(res.body.page.total).toBe(3);
    const [adjMove, transferMove, receiptMove] = res.body.data;
    expect(adjMove).toMatchObject({ reference: 'WH1/ADJ/00001', operationType: 'ADJUSTMENT', direction: 'OUT', quantity: '3.000' });
    expect(transferMove).toMatchObject({ reference: 'WH1/INT/00001', direction: 'INTERNAL', from: { label: 'WH1/Stock' }, to: { label: 'WH1/Rack A' } });
    expect(receiptMove).toMatchObject({ direction: 'IN', from: { label: 'Vendors' }, product: { sku: 'SR-01' }, doneBy: { id: actor.id } });
    expect(typeof receiptMove.id).toBe('string');
  });

  it('filters by product, location on either end, warehouse, type and search', async () => {
    const { agent, actor, stock, rack, wh2, chair, rods } = await setup();
    await receive(actor, rods.id, stock.id, '10');
    await receive(actor, chair.id, wh2.stock.id, '1');
    const t = await draft(actor, 'TRANSFER', stock.id, rack.id, [{ productId: rods.id, quantity: '4' }]);
    await act(actor, t.id, 'confirm');
    await act(actor, t.id, 'validate');
    const count = async (q: string) => (await agent.get(`/api/v1/moves?${q}`)).body.page.total;
    expect(await count(`productId=${rods.id}`)).toBe(2);
    expect(await count(`locationId=${stock.id}`)).toBe(2);
    expect(await count(`locationId=${rack.id}`)).toBe(1);
    expect(await count(`warehouseId=${wh2.warehouse.id}`)).toBe(1);
    expect(await count('type=TRANSFER')).toBe(1);
    expect(await count('search=WH2/IN')).toBe(1);
    expect(await count('search=chair')).toBe(1);
  });

  it('is empty before anything is validated', async () => {
    const { agent } = await setup();
    const res = await agent.get('/api/v1/moves');
    expect(res.body).toEqual({ data: [], page: { page: 1, pageSize: 25, total: 0 } });
    expect(await prisma.stockMove.count()).toBe(0);
  });
});
