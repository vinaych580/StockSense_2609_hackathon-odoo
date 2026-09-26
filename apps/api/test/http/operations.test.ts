import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/db';
import { balance, CUSTOMERS, draft, makeLocation, makePartner, makeProduct, makeWarehouse, receive, resetDb, VENDORS } from '../factories';
import { app, ORIGIN, signedIn } from './helpers';

beforeEach(resetDb);

type Agent = Awaited<ReturnType<typeof signedIn>>['agent'];
const actorOf = (u: { id: string; name: string; role: 'MANAGER' | 'STAFF' }) => ({ id: u.id, name: u.name, role: u.role });

async function setup(role: 'MANAGER' | 'STAFF' = 'MANAGER') {
  const { agent, user } = await signedIn(role);
  const { warehouse, stock } = await makeWarehouse('WH1');
  const product = await makeProduct({ sku: 'CH-01', name: 'Office Chair' });
  return { agent, user, actor: actorOf(user), warehouse, stock, product };
}

const post = (agent: Agent, path: string, body: object) => agent.post(`/api/v1${path}`).set('Origin', ORIGIN).send(body);

describe('POST /operations', () => {
  it('creates a Draft and returns it with its reference', async () => {
    const { agent, stock, product } = await setup();
    const res = await post(agent, '/operations', {
      type: 'RECEIPT', sourceLocationId: VENDORS, destLocationId: stock.id, lines: [{ productId: product.id, quantity: '5' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ reference: 'WH1/IN/00001', status: 'DRAFT', version: 0 });
    expect(res.body.data.lines[0]).toMatchObject({ sku: 'CH-01', quantity: '5.000' });
  });

  it('refuses a Staff user creating a receipt with 403', async () => {
    const { agent, stock, product } = await setup('STAFF');
    const res = await post(agent, '/operations', {
      type: 'RECEIPT', sourceLocationId: VENDORS, destLocationId: stock.id, lines: [{ productId: product.id, quantity: '5' }],
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('validates the body with the shared schema', async () => {
    const { agent, stock } = await setup();
    const res = await post(agent, '/operations', { type: 'RECEIPT', sourceLocationId: VENDORS, destLocationId: stock.id, lines: [{ productId: 'nope' }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('needs a session', async () => {
    const res = await request(app).get('/api/v1/operations');
    expect(res.status).toBe(401);
  });
});

describe('GET /operations/:id and PATCH', () => {
  it('returns one document, and 404 for an unknown or malformed id', async () => {
    const { agent, actor, stock, product } = await setup();
    const op = await draft(actor, 'RECEIPT', VENDORS, stock.id, [{ productId: product.id, quantity: '2' }]);
    expect((await agent.get(`/api/v1/operations/${op.id}`)).body.data.id).toBe(op.id);
    expect((await agent.get('/api/v1/operations/00000000-0000-4000-8000-00000000abcd')).status).toBe(404);
    expect((await agent.get('/api/v1/operations/not-a-uuid')).status).toBe(404);
  });

  it('edits a Draft and bumps its version; a stale version gets 409 STALE_VERSION', async () => {
    const { agent, actor, stock, product } = await setup();
    const op = await draft(actor, 'RECEIPT', VENDORS, stock.id, [{ productId: product.id, quantity: '2' }]);
    const body = { sourceLocationId: VENDORS, destLocationId: stock.id, notes: 'Dock 3', lines: [{ productId: product.id, quantity: '7' }], version: 0 };
    const res = await agent.patch(`/api/v1/operations/${op.id}`).set('Origin', ORIGIN).send(body);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ version: 1, notes: 'Dock 3' });
    expect(res.body.data.lines[0].quantity).toBe('7.000');

    const stale = await agent.patch(`/api/v1/operations/${op.id}`).set('Origin', ORIGIN).send(body);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('STALE_VERSION');
  });
});

describe('POST /operations/:id/:action', () => {
  it('validates a receipt from Draft and posts stock', async () => {
    const { agent, actor, stock, product } = await setup();
    const op = await draft(actor, 'RECEIPT', VENDORS, stock.id, [{ productId: product.id, quantity: '5' }]);
    const res = await post(agent, `/operations/${op.id}/validate`, { version: 0 });
    expect(res.status).toBe(200);
    expect(res.body.data.operation.status).toBe('DONE');
    expect(res.body.data.posted.movesPosted).toBe(1);
    expect(await balance(product.id, stock.id)).toBe('5.000');

    const again = await post(agent, `/operations/${op.id}/validate`, { version: 0 });
    expect(again.status).toBe(200);
    expect(again.body.data.replayed).toBe(true);
  });

  it('refuses to validate a transfer left Waiting by a short confirm', async () => {
    const { agent, actor, stock, product } = await setup();
    await receive(actor, product.id, stock.id, '4');
    const op = await draft(actor, 'TRANSFER', stock.id, (await makeLocation(stock.warehouseId!)).id, [{ productId: product.id, quantity: '10' }]);
    const confirmed = await post(agent, `/operations/${op.id}/confirm`, { version: 0 });
    expect(confirmed.body.data.operation.status).toBe('WAITING');
    const res = await post(agent, `/operations/${op.id}/validate`, { version: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('runs the delivery flow: confirm, pick, pack, validate', async () => {
    const { agent, actor, stock, product } = await setup();
    await receive(actor, product.id, stock.id, '10');
    const customer = await makePartner('CUSTOMER');
    const created = await post(agent, '/operations', {
      type: 'DELIVERY', sourceLocationId: stock.id, destLocationId: CUSTOMERS, partnerId: customer.id, lines: [{ productId: product.id, quantity: '3' }],
    });
    const id = created.body.data.id as string;
    let version = 0;
    for (const action of ['confirm', 'pick', 'pack', 'validate']) {
      const res = await post(agent, `/operations/${id}/${action}`, { version });
      expect(res.status, `${action}: ${JSON.stringify(res.body)}`).toBe(200);
      version = res.body.data.operation.version;
    }
    expect(await balance(product.id, stock.id)).toBe('7.000');
  });

  it('reports a short delivery with INSUFFICIENT_STOCK details at validate', async () => {
    const { agent, actor, stock, product } = await setup();
    await receive(actor, product.id, stock.id, '10');
    const op = await draft(actor, 'DELIVERY', stock.id, CUSTOMERS, [{ productId: product.id, quantity: '8' }]);
    for (const [i, action] of ['confirm', 'pick', 'pack'].entries()) await post(agent, `/operations/${op.id}/${action}`, { version: i });
    // Stock leaves through another document after this one was marked Ready.
    const other = await draft(actor, 'DELIVERY', stock.id, CUSTOMERS, [{ productId: product.id, quantity: '6' }]);
    for (const [i, action] of ['confirm', 'pick', 'pack', 'validate'].entries()) await post(agent, `/operations/${other.id}/${action}`, { version: i });

    const res = await post(agent, `/operations/${op.id}/validate`, { version: 3 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.error.details).toEqual([expect.objectContaining({ sku: 'CH-01', requested: '8.000', available: '4.000' })]);
  });

  it('answers 404 for an unknown action', async () => {
    const { agent, actor, stock, product } = await setup();
    const op = await draft(actor, 'RECEIPT', VENDORS, stock.id, [{ productId: product.id, quantity: '1' }]);
    expect((await post(agent, `/operations/${op.id}/explode`, { version: 0 })).status).toBe(404);
    expect((await post(agent, `/operations/${op.id}/edit`, { version: 0 })).status).toBe(404);
  });

  it('refuses an action body without a version', async () => {
    const { agent, actor, stock, product } = await setup();
    const op = await draft(actor, 'RECEIPT', VENDORS, stock.id, [{ productId: product.id, quantity: '1' }]);
    expect((await post(agent, `/operations/${op.id}/validate`, {})).status).toBe(400);
  });
});

describe('GET /operations', () => {
  async function listSetup() {
    const s = await setup();
    const wh2 = await makeWarehouse('WH2');
    const supplier = await prisma.partner.create({ data: { name: 'Azure Interior', kind: 'SUPPLIER' } });
    const yesterday = new Date(Date.now() - 36 * 3600_000);
    const tomorrow = new Date(Date.now() + 36 * 3600_000);
    const mk = async (type: 'RECEIPT' | 'TRANSFER', src: string, dst: string, extra: object = {}) => {
      const op = await draft(s.actor, type, src, dst, [{ productId: s.product.id, quantity: '1' }]);
      if (Object.keys(extra).length) await prisma.operation.update({ where: { id: op.id }, data: extra });
      return op;
    };
    const late = await mk('RECEIPT', VENDORS, s.stock.id, { scheduledDate: yesterday, partnerId: supplier.id });
    const future = await mk('RECEIPT', VENDORS, s.stock.id, { scheduledDate: tomorrow });
    const other = await mk('RECEIPT', VENDORS, wh2.stock.id);
    const transfer = await mk('TRANSFER', s.stock.id, (await makeLocation(s.warehouse.id)).id);
    await prisma.operation.update({ where: { id: future.id }, data: { status: 'DONE' } });
    return { ...s, late, future, other, transfer, wh2 };
  }

  it('lists with paging metadata, newest first by default', async () => {
    const { agent } = await listSetup();
    const res = await agent.get('/api/v1/operations?pageSize=2');
    expect(res.status).toBe(200);
    expect(res.body.page).toEqual({ page: 1, pageSize: 2, total: 4 });
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].reference).toBe('WH1/INT/00001');
  });

  it('filters by type, status list, warehouse, search and late', async () => {
    const { agent, late, other, transfer, wh2 } = await listSetup();
    const ids = async (q: string) => (await agent.get(`/api/v1/operations?${q}`)).body.data.map((o: { id: string }) => o.id).sort();
    expect(await ids('type=TRANSFER')).toEqual([transfer.id]);
    expect(await ids('type=RECEIPT&status=DRAFT,READY')).toEqual([late.id, other.id].sort());
    expect(await ids(`warehouseId=${wh2.warehouse.id}`)).toEqual([other.id]);
    expect(await ids('search=azure')).toEqual([late.id]);
    expect(await ids('search=wh2/in')).toEqual([other.id]);
    expect(await ids('late=true')).toEqual([late.id]);
  });

  it('late=false keeps open documents that have no scheduled date', async () => {
    const { agent, future, other, transfer } = await listSetup();
    const ids = (await agent.get('/api/v1/operations?late=false')).body.data.map((o: { id: string }) => o.id).sort();
    expect(ids).toEqual([future.id, other.id, transfer.id].sort());
  });

  // Expectations assume APP_TIMEZONE=Asia/Kolkata, as in .env.example.
  it('reads a date-only range as whole business days, and an ISO instant exactly', async () => {
    const s = await setup();
    const scheduled = async (iso: string) => {
      const op = await draft(s.actor, 'RECEIPT', VENDORS, s.stock.id, [{ productId: s.product.id, quantity: '1' }]);
      await prisma.operation.update({ where: { id: op.id }, data: { scheduledDate: new Date(iso) } });
      return op.id;
    };
    await scheduled('2026-09-25T23:30:00+05:30');
    const early = await scheduled('2026-09-26T00:30:00+05:30');
    const late = await scheduled('2026-09-26T23:30:00+05:30');
    await scheduled('2026-09-27T00:30:00+05:30');
    const ids = async (q: string) => (await s.agent.get(`/api/v1/operations?${q}`)).body.data.map((o: { id: string }) => o.id).sort();
    expect(await ids('dateFrom=2026-09-26&dateTo=2026-09-26')).toEqual([early, late].sort());
    expect(await ids('dateFrom=2026-09-26T12:00:00%2B05:30&dateTo=2026-09-26T23:30:00%2B05:30')).toEqual([late]);
  });

  it('filters by location on either end, and by product category', async () => {
    const { agent, stock, product, transfer, late, future } = await listSetup();
    const cat = await prisma.category.create({ data: { name: 'Furniture' } });
    await prisma.product.update({ where: { id: product.id }, data: { categoryId: cat.id } });
    const byLoc = (await agent.get(`/api/v1/operations?locationId=${stock.id}`)).body.data.map((o: { id: string }) => o.id).sort();
    expect(byLoc).toEqual([late.id, future.id, transfer.id].sort());
    expect((await agent.get(`/api/v1/operations?categoryId=${cat.id}`)).body.page.total).toBe(4);
  });

  it('caps pageSize at 100 and rejects an unknown sort', async () => {
    const { agent } = await setup();
    expect((await agent.get('/api/v1/operations?pageSize=101')).status).toBe(400);
    expect((await agent.get('/api/v1/operations?sort=password')).status).toBe(400);
  });
});
