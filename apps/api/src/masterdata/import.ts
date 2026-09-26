/**
 * Product import from CSV. The whole file is checked first and written in one transaction:
 * if any row has an error nothing is written. New SKUs are created, existing ones updated
 * (blank cells keep the current value), missing categories are created, and initial stock for
 * new products is posted through inventory adjustments, so it shows in the ledger.
 *
 * Columns (header names are case-, space- and underscore-insensitive; only sku is required):
 *   sku, name, category, uom, unit_cost, initial_qty, location, min_qty, max_qty
 * `location` is "WH1/STOCK" (warehouse code / location code or name) or just "WH1" for its Stock.
 * min_qty/max_qty set the reorder rule for the location's warehouse (or a `warehouse` column).
 */
import { randomUUID } from 'node:crypto';
import {
  fitsUom,
  QUANTITY_PATTERN,
  skuInput,
  UOM_DECIMALS,
  type ImportIssue,
  type ProductImportInput,
  type ProductImportResult,
  type Uom,
} from '@stocksense/shared';
import { Prisma } from '@prisma/client';
import { withTx, type Tx } from '../lib/db';
import { AppError } from '../lib/errors';
import type { Actor } from '../inventory/posting';
import { announce, audit } from './common';
import { postInitialStock, type InitialStockLine } from './initial-stock';

export const MAX_IMPORT_ROWS = 2000;
/** A full file posts thousands of rows in one transaction; ordinary requests keep the 10 s limit. */
const IMPORT_TX = { timeout: 60_000 };

export const IMPORT_TEMPLATE =
  'sku,name,category,uom,unit_cost,initial_qty,location,min_qty,max_qty\n' +
  'CH-01,Office Chair,Furniture,UNIT,4500.00,25,WH1/STOCK,10,40\n' +
  'SR-01,Steel Rods,Raw Materials,KG,62.50,120.5,WH1/RACKA,50,200\n';

const COLUMNS: Record<string, string> = {
  sku: 'sku', productcode: 'sku', code: 'sku', internalreference: 'sku',
  name: 'name', productname: 'name',
  category: 'category', productcategory: 'category',
  uom: 'uom', unit: 'uom', unitofmeasure: 'uom',
  unitcost: 'unitCost', cost: 'unitCost', costprice: 'unitCost', price: 'unitCost',
  initialqty: 'initialQty', initialstock: 'initialQty', qty: 'initialQty', quantity: 'initialQty', onhand: 'initialQty',
  location: 'location',
  warehouse: 'warehouse',
  minqty: 'minQty', min: 'minQty', reordermin: 'minQty',
  maxqty: 'maxQty', max: 'maxQty', reordermax: 'maxQty',
};

const UOM_ALIASES: Record<string, Uom> = {
  unit: 'UNIT', units: 'UNIT', pc: 'UNIT', pcs: 'UNIT', piece: 'UNIT', pieces: 'UNIT', ea: 'UNIT', each: 'UNIT', nos: 'UNIT',
  box: 'BOX', boxes: 'BOX',
  kg: 'KG', kgs: 'KG', kilogram: 'KG', kilograms: 'KG',
  l: 'L', ltr: 'L', litre: 'L', liter: 'L', litres: 'L', liters: 'L',
  m: 'M', meter: 'M', metre: 'M', meters: 'M', metres: 'M',
};

/** RFC 4180 CSV: quoted fields, "" escapes, commas and newlines inside quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (quoted) throw new AppError('VALIDATION_FAILED', 'The file ends inside a quoted field; check for an unmatched "');
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

interface ParsedRow {
  row: number;
  sku: string;
  name?: string;
  category?: string;
  uom?: Uom;
  unitCost?: string;
  initialQty?: string;
  locationId?: string;
  warehouseId?: string;
  minQty?: string;
  maxQty?: string;
}

interface Refs {
  warehouses: Map<string, { id: string; isActive: boolean; stockId?: string }>;
  /** "WH1/RACKA" and "WH1/Rack A" (upper-cased) → location. */
  locations: Map<string, { id: string; isActive: boolean }>;
}

async function loadRefs(tx: Tx): Promise<Refs> {
  const whs = await tx.warehouse.findMany({ include: { locations: { where: { type: 'INTERNAL' } } } });
  const refs: Refs = { warehouses: new Map(), locations: new Map() };
  for (const w of whs) {
    const stock = w.locations.find((l) => l.code === 'STOCK') ?? w.locations[0];
    refs.warehouses.set(w.code.toUpperCase(), { id: w.id, isActive: w.isActive, stockId: stock?.id });
    for (const l of w.locations) {
      const v = { id: l.id, isActive: l.isActive && w.isActive };
      refs.locations.set(`${w.code}/${l.code}`.toUpperCase(), v);
      refs.locations.set(`${w.code}/${l.name}`.toUpperCase(), v);
    }
  }
  return refs;
}

export async function importProducts(actor: Actor, input: ProductImportInput): Promise<ProductImportResult> {
  const table = parseCsv(input.csv);
  if (table.length < 2) throw new AppError('VALIDATION_FAILED', 'The file needs a header row and at least one product');
  if (table.length - 1 > MAX_IMPORT_ROWS) {
    throw new AppError('VALIDATION_FAILED', `At most ${MAX_IMPORT_ROWS} products per file; this one has ${table.length - 1}. Split it.`);
  }

  const header = table[0]!.map((h) => COLUMNS[h.trim().toLowerCase().replace(/[\s_\-.()]/g, '')]);
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const unknown = table[0]!.filter((_, i) => header[i] === undefined).map((h) => h.trim()).filter(Boolean);
  if (unknown.length) warnings.push({ row: 1, message: `Ignored unknown column${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}` });
  if (!header.includes('sku')) throw new AppError('VALIDATION_FAILED', 'The header row needs a "sku" column', { columns: table[0] });

  const run = async (tx: Tx, ctx: Parameters<Parameters<typeof withTx>[0]>[1] | null): Promise<ProductImportResult> => {
    const refs = await loadRefs(tx);
    const rows: ParsedRow[] = [];
    const seen = new Map<string, number>();

    table.slice(1).forEach((cells, i) => {
      const row = i + 2;
      const get = (key: string) => {
        const idx = header.indexOf(key);
        const v = idx >= 0 ? cells[idx]?.trim() : undefined;
        return v ? v : undefined;
      };
      const err = (column: string, message: string) => errors.push({ row, column, message });

      const sku = skuInput.safeParse(get('sku') ?? '');
      if (!sku.success) return err('sku', sku.error.issues[0]?.message ?? 'Invalid SKU');
      if (seen.has(sku.data)) return err('sku', `${sku.data} already appears on row ${seen.get(sku.data)}`);
      seen.set(sku.data, row);
      const r: ParsedRow = { row, sku: sku.data };

      const name = get('name');
      if (name && name.length > 120) err('name', 'At most 120 characters');
      r.name = name;
      const category = get('category');
      if (category && category.length > 120) err('category', 'At most 120 characters');
      r.category = category;

      const uom = get('uom');
      if (uom) {
        r.uom = UOM_ALIASES[uom.toLowerCase()] ?? (uom.toUpperCase() in UOM_DECIMALS ? (uom.toUpperCase() as Uom) : undefined);
        if (!r.uom) err('uom', `Unknown unit "${uom}"; use UNIT, BOX, KG, L or M`);
      }
      const cost = get('unitCost')?.replace(/[,₹$€£\s]/g, '');
      if (cost !== undefined) {
        if (!/^\d{1,10}(\.\d{1,2})?$/.test(cost)) err('unit_cost', `"${get('unitCost')}" is not a price with at most 2 decimals`);
        else r.unitCost = cost;
      }

      const qtyOk = (key: string, label: string) => {
        const v = get(key)?.replace(/,/g, '');
        if (v === undefined) return undefined;
        if (!QUANTITY_PATTERN.test(v)) { err(label, `"${v}" is not a quantity (at most 3 decimals)`); return undefined; }
        return v;
      };
      r.initialQty = qtyOk('initialQty', 'initial_qty');
      r.minQty = qtyOk('minQty', 'min_qty');
      r.maxQty = qtyOk('maxQty', 'max_qty');

      const loc = get('location')?.toUpperCase();
      if (loc) {
        const [wh, rest] = loc.includes('/') ? [loc.slice(0, loc.indexOf('/')), loc.slice(loc.indexOf('/') + 1)] : [loc, undefined];
        const w = refs.warehouses.get(wh);
        const l = rest ? refs.locations.get(`${wh}/${rest}`) : w?.stockId ? { id: w.stockId, isActive: w.isActive } : undefined;
        if (!w || !l) err('location', `No location "${get('location')}"; use WAREHOUSE/LOCATION, e.g. WH1/STOCK`);
        else if (!l.isActive) err('location', `${get('location')} is archived`);
        else { r.locationId = l.id; r.warehouseId = w.id; }
      }
      const whCode = get('warehouse')?.toUpperCase();
      if (whCode) {
        const w = refs.warehouses.get(whCode);
        if (!w) err('warehouse', `No warehouse "${whCode}"`);
        else if (!w.isActive) err('warehouse', `${whCode} is archived`);
        else r.warehouseId = w.id;
      }

      if ((r.minQty === undefined) !== (r.maxQty === undefined)) err(r.minQty === undefined ? 'min_qty' : 'max_qty', 'Give both min_qty and max_qty, or neither');
      else if (r.minQty !== undefined && Number(r.maxQty) < Number(r.minQty)) err('max_qty', 'max_qty must be at least min_qty');
      else if (r.minQty !== undefined && !r.warehouseId) err('location', 'A reorder rule needs a location or warehouse column');
      rows.push(r);
    });

    // Compare against what exists.
    const existing = new Map(
      (await tx.product.findMany({ where: { sku: { in: rows.map((r) => r.sku) } } })).map((p) => [p.sku, p]),
    );
    const usedIds = new Set(
      (await tx.operationLine.groupBy({ by: ['productId'], where: { productId: { in: [...existing.values()].map((p) => p.id) } } })).map((g) => g.productId),
    );
    const rules = new Map(
      (await tx.reorderRule.findMany({ where: { productId: { in: [...existing.values()].map((p) => p.id) } } })).map((x) => [
        `${x.productId}|${x.warehouseId}`,
        x,
      ]),
    );
    /** A row's reorder rule that differs from the stored one (or has none stored yet). */
    const ruleChange = (r: ParsedRow, productId: string | undefined) => {
      if (r.minQty === undefined || r.maxQty === undefined || !r.warehouseId) return false;
      const cur = productId ? rules.get(`${productId}|${r.warehouseId}`) : undefined;
      return !cur || !cur.minQty.equals(r.minQty) || !cur.maxQty.equals(r.maxQty);
    };
    const categories = await tx.category.findMany();
    const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
    const newCategories = new Map<string, string>();

    for (const r of rows) {
      const p = existing.get(r.sku);
      if (p && !input.updateExisting) errors.push({ row: r.row, column: 'sku', message: `${r.sku} already exists` });
      if (p && !p.isActive) warnings.push({ row: r.row, column: 'sku', message: `${r.sku} is archived; it will be updated but stays archived` });
      if (!p && !r.name) errors.push({ row: r.row, column: 'name', message: 'A new product needs a name' });
      const uom = r.uom ?? p?.uom ?? 'UNIT';
      if (p && r.uom && r.uom !== p.uom && usedIds.has(p.id)) {
        errors.push({ row: r.row, column: 'uom', message: `${r.sku} is already on documents; its unit stays ${p.uom}` });
      }
      if (r.initialQty !== undefined) {
        if (p) warnings.push({ row: r.row, column: 'initial_qty', message: `${r.sku} already exists; initial_qty ignored (use an inventory adjustment)` });
        else if (!r.locationId && Number(r.initialQty) > 0) errors.push({ row: r.row, column: 'location', message: 'Initial stock needs a location' });
        else if (!fitsUom(r.initialQty, uom)) errors.push({ row: r.row, column: 'initial_qty', message: `${uom} allows at most ${UOM_DECIMALS[uom]} decimals` });
      }
      for (const [key, col] of [['minQty', 'min_qty'], ['maxQty', 'max_qty']] as const) {
        const v = r[key];
        if (v !== undefined && !fitsUom(v, uom)) errors.push({ row: r.row, column: col, message: `${uom} allows at most ${UOM_DECIMALS[uom]} decimals` });
      }
      if (r.category) {
        const c = catByName.get(r.category.toLowerCase());
        if (c && !c.isActive) errors.push({ row: r.row, column: 'category', message: `The category ${c.name} is archived` });
        if (!c) newCategories.set(r.category.toLowerCase(), r.category);
      }
    }

    const result: ProductImportResult = {
      dryRun: input.dryRun,
      rows: rows.length,
      created: 0,
      updated: 0,
      unchanged: 0,
      categoriesCreated: [...newCategories.values()],
      stockOperations: [],
      errors: errors.sort((a, b) => a.row - b.row),
      warnings,
    };

    // Count what would happen, and on a real run, do it.
    const write = !input.dryRun && errors.length === 0;
    if (write) {
      for (const name of newCategories.values()) {
        const c = await tx.category.create({ data: { name } });
        catByName.set(name.toLowerCase(), c);
        await audit(tx, actor, 'create', 'category', c.id, null, { ...c, source: 'import' });
      }
    }
    const creates: Prisma.ProductCreateManyInput[] = [];
    const stock: InitialStockLine[] = [];
    const touched: string[] = [];

    for (const r of rows) {
      const p = existing.get(r.sku);
      const categoryId = r.category ? (catByName.get(r.category.toLowerCase())?.id ?? null) : undefined;
      if (!p) {
        result.created++;
        const id = randomUUID();
        creates.push({ id, sku: r.sku, name: r.name!, uom: r.uom ?? 'UNIT', unitCost: r.unitCost ?? null, categoryId: categoryId ?? null });
        if (r.initialQty && r.locationId) stock.push({ productId: id, locationId: r.locationId, quantity: r.initialQty });
        touched.push(id);
        continue;
      }
      const data: Prisma.ProductUncheckedUpdateInput = {};
      if (r.name && r.name !== p.name) data.name = r.name;
      if (r.uom && r.uom !== p.uom) data.uom = r.uom;
      if (r.unitCost !== undefined && (p.unitCost === null || !p.unitCost.equals(r.unitCost))) data.unitCost = r.unitCost;
      if (r.category && categoryId !== p.categoryId) data.categoryId = categoryId;
      if (Object.keys(data).length === 0 && !ruleChange(r, p.id)) result.unchanged++;
      else {
        result.updated++;
        touched.push(p.id);
        if (write && Object.keys(data).length > 0) {
          const after = await tx.product.update({ where: { id: p.id }, data });
          await audit(tx, actor, 'update', 'product', p.id, p, { ...after, source: 'import' });
        }
      }
    }
    if (!write || !ctx) return result;

    if (creates.length) {
      await tx.product.createMany({ data: creates });
      await tx.auditLog.createMany({
        data: creates.map((c) => ({ userId: actor.id, action: 'create', entity: 'product', entityId: c.id!, after: { sku: c.sku, name: c.name, source: 'import' } })),
      });
    }
    const productId = new Map(creates.map((c) => [c.sku, c.id!]));
    const newRules: Prisma.ReorderRuleCreateManyInput[] = [];
    for (const r of rows) {
      const known = existing.get(r.sku)?.id;
      if (!ruleChange(r, known) || r.minQty === undefined || r.maxQty === undefined || !r.warehouseId) continue;
      const id = productId.get(r.sku) ?? known!;
      if (!known) {
        newRules.push({ productId: id, warehouseId: r.warehouseId, minQty: r.minQty, maxQty: r.maxQty });
        continue;
      }
      await tx.reorderRule.upsert({
        where: { productId_warehouseId: { productId: id, warehouseId: r.warehouseId } },
        create: { productId: id, warehouseId: r.warehouseId, minQty: r.minQty, maxQty: r.maxQty },
        update: { minQty: r.minQty, maxQty: r.maxQty },
      });
    }
    if (newRules.length) await tx.reorderRule.createMany({ data: newRules });
    result.stockOperations = await postInitialStock(tx, ctx, actor, stock);
    announce(ctx, actor, { productIds: touched });
    return result;
  };

  if (input.dryRun) {
    // Reads only; a transaction still gives one consistent snapshot of products and locations.
    return withTx((tx) => run(tx, null), IMPORT_TX);
  }
  const result = await withTx((tx, ctx) => run(tx, ctx), IMPORT_TX);
  if (result.errors.length > 0) {
    const n = new Set(result.errors.map((e) => e.row)).size;
    throw new AppError('VALIDATION_FAILED', `${n} row${n > 1 ? 's have' : ' has'} problems; nothing was imported`, result);
  }
  return result;
}
