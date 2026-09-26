import { Router, type Request } from 'express';
import {
  categoryInput,
  listActiveQuery,
  locationCreateInput,
  locationListQuery,
  locationUpdateInput,
  partnerCreateInput,
  partnerListQuery,
  partnerUpdateInput,
  productCreateInput,
  productImportInput,
  productListQuery,
  productUpdateInput,
  reorderRuleInput,
  warehouseCreateInput,
  warehouseUpdateInput,
} from '@stocksense/shared';
import { z } from 'zod';
import { AppError } from '../lib/errors';
import { actorOf, requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as catalog from './catalog';
import { IMPORT_TEMPLATE, importProducts } from './import';
import * as products from './products';

const view = requirePermission('masterdata.view');
const edit = requirePermission('masterdata.edit');

/** A malformed id can't match any record, so it's a 404 rather than a 400. */
function uuidParam(raw: unknown, what: string): string {
  const parsed = z.uuid().safeParse(raw);
  if (!parsed.success) throw new AppError('NOT_FOUND', `${what} not found`);
  return parsed.data;
}

const idOf = (req: Request, what: string) => uuidParam(req.params.id, what);

const activeOf = (req: Request) => listActiveQuery.parse(req.query).active;

/** /api/v1/products, including CSV import and reorder rules. */
export function productsRouter(): Router {
  const r = Router();
  r.get('/', view, async (req, res) => {
    res.json(await products.listProducts(productListQuery.parse(req.query)));
  });
  r.get('/import/template', view, (_req, res) => {
    res.type('text/csv').attachment('stocksense-products.csv').send(IMPORT_TEMPLATE);
  });
  r.post('/import', edit, validate(productImportInput), async (req, res) => {
    res.json({ data: await importProducts(actorOf(req), req.body) });
  });
  r.post('/', edit, validate(productCreateInput), async (req, res) => {
    res.status(201).json({ data: await products.createProduct(actorOf(req), req.body) });
  });
  r.get('/:id', view, async (req, res) => {
    res.json({ data: await products.getProduct(idOf(req, 'Product')) });
  });
  r.patch('/:id', edit, validate(productUpdateInput), async (req, res) => {
    res.json({ data: await products.updateProduct(actorOf(req), idOf(req, 'Product'), req.body) });
  });
  r.post('/:id/archive', edit, async (req, res) => {
    res.json({ data: await products.archiveProduct(actorOf(req), idOf(req, 'Product')) });
  });
  r.post('/:id/restore', edit, async (req, res) => {
    res.json({ data: await products.restoreProduct(actorOf(req), idOf(req, 'Product')) });
  });
  return r;
}

/** /api/v1/reorder-rules: settings, not history. One rule per product and warehouse, replaced or deleted in place. */
export function reorderRulesRouter(): Router {
  const r = Router();
  r.put('/', edit, validate(reorderRuleInput), async (req, res) => {
    res.json({ data: await products.upsertReorderRule(actorOf(req), req.body) });
  });
  r.delete('/:id', edit, async (req, res) => {
    await products.deleteReorderRule(actorOf(req), idOf(req, 'Reorder rule'));
    res.status(204).end();
  });
  return r;
}

export function categoriesRouter(): Router {
  const r = Router();
  r.get('/', view, async (req, res) => {
    res.json({ data: await catalog.listCategories(activeOf(req)) });
  });
  r.post('/', edit, validate(categoryInput), async (req, res) => {
    res.status(201).json({ data: await catalog.createCategory(actorOf(req), req.body) });
  });
  r.patch('/:id', edit, validate(categoryInput), async (req, res) => {
    res.json({ data: await catalog.updateCategory(actorOf(req), idOf(req, 'Category'), req.body) });
  });
  r.post('/:id/archive', edit, async (req, res) => {
    res.json({ data: await catalog.setCategoryActive(actorOf(req), idOf(req, 'Category'), false) });
  });
  r.post('/:id/restore', edit, async (req, res) => {
    res.json({ data: await catalog.setCategoryActive(actorOf(req), idOf(req, 'Category'), true) });
  });
  return r;
}

export function warehousesRouter(): Router {
  const r = Router();
  r.get('/', view, async (req, res) => {
    res.json({ data: await catalog.listWarehouses(activeOf(req)) });
  });
  r.post('/', edit, validate(warehouseCreateInput), async (req, res) => {
    res.status(201).json({ data: await catalog.createWarehouse(actorOf(req), req.body) });
  });
  r.get('/:id', view, async (req, res) => {
    res.json({ data: await catalog.getWarehouse(idOf(req, 'Warehouse')) });
  });
  r.patch('/:id', edit, validate(warehouseUpdateInput), async (req, res) => {
    res.json({ data: await catalog.updateWarehouse(actorOf(req), idOf(req, 'Warehouse'), req.body) });
  });
  r.post('/:id/archive', edit, async (req, res) => {
    res.json({ data: await catalog.setWarehouseActive(actorOf(req), idOf(req, 'Warehouse'), false) });
  });
  r.post('/:id/restore', edit, async (req, res) => {
    res.json({ data: await catalog.setWarehouseActive(actorOf(req), idOf(req, 'Warehouse'), true) });
  });
  return r;
}

export function locationsRouter(): Router {
  const r = Router();
  r.get('/', view, async (req, res) => {
    res.json({ data: await catalog.listLocations(locationListQuery.parse(req.query)) });
  });
  r.post('/', edit, validate(locationCreateInput), async (req, res) => {
    res.status(201).json({ data: await catalog.createLocation(actorOf(req), req.body) });
  });
  r.patch('/:id', edit, validate(locationUpdateInput), async (req, res) => {
    res.json({ data: await catalog.updateLocation(actorOf(req), idOf(req, 'Location'), req.body) });
  });
  r.post('/:id/archive', edit, async (req, res) => {
    res.json({ data: await catalog.setLocationActive(actorOf(req), idOf(req, 'Location'), false) });
  });
  r.post('/:id/restore', edit, async (req, res) => {
    res.json({ data: await catalog.setLocationActive(actorOf(req), idOf(req, 'Location'), true) });
  });
  return r;
}

export function partnersRouter(): Router {
  const r = Router();
  r.get('/', view, async (req, res) => {
    res.json(await catalog.listPartners(partnerListQuery.parse(req.query)));
  });
  r.post('/', edit, validate(partnerCreateInput), async (req, res) => {
    res.status(201).json({ data: await catalog.createPartner(actorOf(req), req.body) });
  });
  r.get('/:id', view, async (req, res) => {
    res.json({ data: await catalog.getPartner(idOf(req, 'Contact')) });
  });
  r.patch('/:id', edit, validate(partnerUpdateInput), async (req, res) => {
    res.json({ data: await catalog.updatePartner(actorOf(req), idOf(req, 'Contact'), req.body) });
  });
  r.post('/:id/archive', edit, async (req, res) => {
    res.json({ data: await catalog.setPartnerActive(actorOf(req), idOf(req, 'Contact'), false) });
  });
  r.post('/:id/restore', edit, async (req, res) => {
    res.json({ data: await catalog.setPartnerActive(actorOf(req), idOf(req, 'Contact'), true) });
  });
  return r;
}
