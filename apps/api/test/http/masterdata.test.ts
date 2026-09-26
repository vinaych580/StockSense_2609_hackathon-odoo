import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/db';
import { CUSTOMERS, draft, makeProduct, makeWarehouse, receive, resetDb } from '../factories';
import { ORIGIN, signedIn } from './helpers';

beforeEach(resetDb);

async function manager() {
  const { agent, user } = await signedIn('MANAGER');
  const actor = { id: user.id, name: user.name, role: user.role };
  const post = (url: string, body: object = {}) => agent.post(`/api/v1${url}`).set('Origin', ORIGIN).send(body);
  const patch = (url: string, body: object) => agent.patch(`/api/v1${url}`).set('Origin', ORIGIN).send(body);
  return { agent, actor, post, patch };
}

describe('products', () => {
  it('creates a product with initial stock posted through an adjustment', async () => {
    const { agent, post } = await manager();
    const { stock } = await makeWarehouse('WH1');
    const cat = await post('/categories', { name: 'Furniture' });
    expect(cat.status).toBe(201);

    const res = await post('/products', {
      sku: ' ch-01 ',
      name: 'Office Chair',
      categoryId: cat.body.data.id,
      uom: 'UNIT',
      unitCost: '4500',
      initialStock: [{ locationId: stock.id, quantity: '25' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ sku: 'CH-01', onHand: '25.000', category: { name: 'Furniture' }, unitCost: '4500.00' });
    expect(res.body.data.stockOperations).toEqual(['WH1/ADJ/00001']);

    const moves = await agent.get('/api/v1/moves');
    expect(moves.body.data).toHaveLength(1);
    expect((await agent.get('/api/v1/products?search=chair')).body.page.total).toBe(1);
  });

  it('rejects a duplicate SKU and staff edits', async () => {
    const { post } = await manager();
    await makeProduct({ sku: 'CH-01' });
    expect((await post('/products', { sku: 'ch-01', name: 'Again' })).body.error.code).toBe('SKU_TAKEN');

    const staff = await signedIn('STAFF');
    const res = await staff.agent.post('/api/v1/products').set('Origin', ORIGIN).send({ sku: 'X-1', name: 'X' });
    expect(res.status).toBe(403);
    expect((await staff.agent.get('/api/v1/products')).status).toBe(200);
  });

  it('locks the unit once the product is on a document line', async () => {
    const { actor, patch } = await manager();
    const { stock } = await makeWarehouse('WH1');
    const p = await makeProduct();
    expect((await patch(`/products/${p.id}`, { uom: 'KG' })).status).toBe(200);
    await draft(actor, 'DELIVERY', stock.id, CUSTOMERS, [{ productId: p.id, quantity: '1' }]);
    const res = await patch(`/products/${p.id}`, { uom: 'UNIT' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('UOM_LOCKED');
  });

  it('refuses to archive a product with stock, then archives and restores it', async () => {
    const { actor, post } = await manager();
    const { stock } = await makeWarehouse('WH1');
    const p = await makeProduct();
    await receive(actor, p.id, stock.id, '3');
    expect((await post(`/products/${p.id}/archive`)).body.error.code).toBe('IN_USE');

    const q = await makeProduct();
    expect((await post(`/products/${q.id}/archive`)).body.data.isActive).toBe(false);
    expect((await post(`/products/${q.id}/restore`)).body.data.isActive).toBe(true);
  });

  it('sets and deletes reorder rules', async () => {
    const { agent } = await manager();
    const { warehouse } = await makeWarehouse('WH1');
    const p = await makeProduct();
    const put = (minQty: string, maxQty: string) =>
      agent.put('/api/v1/reorder-rules').set('Origin', ORIGIN).send({ productId: p.id, warehouseId: warehouse.id, minQty, maxQty });
    const first = await put('5', '20');
    expect(first.status).toBe(200);
    expect((await put('6', '20')).body.data.id).toBe(first.body.data.id);
    expect((await agent.get(`/api/v1/products/${p.id}`)).body.data.reorderRules).toMatchObject([{ minQty: '6.000', maxQty: '20.000', warehouseCode: 'WH1' }]);
    expect((await put('5', '2')).status).toBe(400);
    // A UNIT product takes whole-number thresholds.
    expect((await put('1.5', '2')).body.error.code).toBe('UOM_PRECISION');
    const url = `/api/v1/reorder-rules/${first.body.data.id}`;
    expect((await agent.delete(url).set('Origin', ORIGIN)).status).toBe(204);
    expect((await agent.delete(url).set('Origin', ORIGIN)).status).toBe(404);
  });
});

describe('warehouses and locations', () => {
  it('creates a warehouse with a Stock location and adds locations', async () => {
    const { agent, post } = await manager();
    const w = await post('/warehouses', { code: 'wh3', name: 'Third' });
    expect(w.status).toBe(201);
    expect(w.body.data).toMatchObject({ code: 'WH3', codeEditable: true, locations: [{ code: 'STOCK', label: 'WH3/Stock' }] });
    const l = await post('/locations', { warehouseId: w.body.data.id, code: 'racka', name: 'Rack A' });
    expect(l.body.data).toMatchObject({ code: 'RACKA', label: 'WH3/Rack A', type: 'INTERNAL' });
    expect((await post('/locations', { warehouseId: w.body.data.id, code: 'RACKA', name: 'Dup' })).body.error.code).toBe('ALREADY_EXISTS');
    const virt = await agent.get('/api/v1/locations?includeVirtual=true');
    expect(virt.body.data.length).toBe(5);
  });

  it('locks the code once the warehouse has documents, and refuses to archive while stock remains', async () => {
    const { actor, post, patch } = await manager();
    const { warehouse, stock } = await makeWarehouse('WH1');
    const p = await makeProduct();
    await receive(actor, p.id, stock.id, '2');
    expect((await patch(`/warehouses/${warehouse.id}`, { code: 'WHX' })).body.error.code).toBe('IN_USE');
    expect((await patch(`/warehouses/${warehouse.id}`, { name: 'Renamed' })).body.data.name).toBe('Renamed');
    expect((await post(`/warehouses/${warehouse.id}/archive`)).body.error.code).toBe('IN_USE');
    expect((await post(`/locations/${stock.id}/archive`)).body.error.code).toBe('IN_USE');

    const empty = await makeWarehouse('WH2');
    const archived = await post(`/warehouses/${empty.warehouse.id}/archive`);
    expect(archived.body.data.isActive).toBe(false);
    expect(archived.body.data.locations.every((l: { isActive: boolean }) => !l.isActive)).toBe(true);
    expect((await post('/locations', { warehouseId: empty.warehouse.id, code: 'X', name: 'X' })).body.error.code).toBe('INACTIVE_REFERENCE');
  });

  it('does not let anyone change the virtual locations', async () => {
    const { post } = await manager();
    expect((await post(`/locations/${CUSTOMERS}/archive`)).status).toBe(403);
  });
});

describe('contacts and categories', () => {
  it('creates, edits and archives contacts', async () => {
    const { agent, post, patch } = await manager();
    const c = await post('/partners', { name: 'Acme Steel', kind: 'SUPPLIER', email: 'Sales@Acme.test' });
    expect(c.body.data).toMatchObject({ email: 'sales@acme.test', isActive: true });
    expect((await patch(`/partners/${c.body.data.id}`, { phone: '+91 99999' })).body.data.phone).toBe('+91 99999');
    await post(`/partners/${c.body.data.id}/archive`);
    expect((await agent.get('/api/v1/partners?kind=SUPPLIER')).body.page.total).toBe(0);
    expect((await agent.get('/api/v1/partners?active=all')).body.page.total).toBe(1);
  });

  it('keeps category names unique ignoring case', async () => {
    const { post } = await manager();
    await post('/categories', { name: 'Furniture' });
    expect((await post('/categories', { name: 'furniture' })).body.error.code).toBe('ALREADY_EXISTS');
  });
});

describe('POST /products/import', () => {
  const csv = [
    'SKU,Name,Category,UoM,Unit Cost,Initial Qty,Location,Min Qty,Max Qty',
    'ch-01,Office Chair,Furniture,pcs,4500,25,WH1/STOCK,10,40',
    'sr-01,"Steel Rods, 12mm",Raw Materials,kg,62.50,120.5,WH1/Rack A,50,200',
    'dk-01,Desk,Furniture,unit,,,,,',
  ].join('\r\n');

  it('previews without writing, then imports with stock, categories and reorder rules', async () => {
    const { agent, post } = await manager();
    const { warehouse } = await makeWarehouse('WH1');
    await prisma.location.create({ data: { warehouseId: warehouse.id, code: 'RACKA', name: 'Rack A' } });

    const preview = await post('/products/import', { csv, dryRun: true });
    expect(preview.status).toBe(200);
    expect(preview.body.data).toMatchObject({ dryRun: true, created: 3, errors: [], categoriesCreated: ['Furniture', 'Raw Materials'] });
    expect(await prisma.product.count()).toBe(0);

    const res = await post('/products/import', { csv });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 3, updated: 0, stockOperations: ['WH1/ADJ/00001', 'WH1/ADJ/00002'] }); // one per location
    const rods = (await agent.get('/api/v1/products?search=SR-01')).body.data[0];
    expect(rods).toMatchObject({ name: 'Steel Rods, 12mm', uom: 'KG', onHand: '120.500', reorderRules: [{ minQty: '50.000' }] });

    // Re-importing updates what changed and leaves the rest.
    const again = await post('/products/import', { csv: 'sku,name,unit_cost\nCH-01,Office Chair,4600\nDK-01,Desk,' });
    expect(again.body.data).toMatchObject({ created: 0, updated: 1, unchanged: 1 });

    // A row that only changes the reorder rule counts as an update; the same rule again doesn't.
    const rule = await post('/products/import', { csv: 'sku,location,min_qty,max_qty\nSR-01,WH1,60,200\nCH-01,WH1/STOCK,10,40' });
    expect(rule.body.data).toMatchObject({ updated: 1, unchanged: 1 });
    expect((await agent.get('/api/v1/products?search=SR-01')).body.data[0].reorderRules[0].minQty).toBe('60.000');
  });

  it('rejects the whole file when any row is wrong', async () => {
    const { post } = await manager();
    await makeWarehouse('WH1');
    const bad = ['sku,name,uom,initial_qty,location', 'A-1,Good,UNIT,1,WH1', 'B-1,,UNIT,,', 'C-1,Frac,UNIT,1.5,WH1/STOCK', 'D-1,X,parsec,,', 'a-1,Dup,,,'].join('\n');
    const res = await post('/products/import', { csv: bad });
    expect(res.status).toBe(400);
    expect(res.body.error.details.errors.map((e: { row: number; column: string }) => [e.row, e.column])).toEqual([
      [3, 'name'],
      [4, 'initial_qty'],
      [5, 'uom'],
      [6, 'sku'],
    ]);
    expect(await prisma.product.count()).toBe(0);
  });

  it('serves a template and is manager-only', async () => {
    const staff = await signedIn('STAFF');
    const tpl = await staff.agent.get('/api/v1/products/import/template');
    expect(tpl.status).toBe(200);
    expect(tpl.text.split('\n')[0]).toContain('sku,name');
    expect((await staff.agent.post('/api/v1/products/import').set('Origin', ORIGIN).send({ csv: tpl.text })).status).toBe(403);
  });
});
