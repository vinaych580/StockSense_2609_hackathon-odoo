/** Products: list, read, create (with initial stock), edit, archive and restore. */
import {
  fitsUom,
  UOM_DECIMALS,
  type ListResponse,
  type ProductCreateInput,
  type ProductDto,
  type ProductListQuery,
  type ProductUpdateInput,
  type ReorderRuleDto,
  type ReorderRuleInput,
} from '@stocksense/shared';
import { Prisma } from '@prisma/client';
import { prisma, withTx, type Tx } from '../lib/db';
import { AppError, notFound } from '../lib/errors';
import type { Actor } from '../inventory/posting';
import { stockHealth } from '../inventory/health';
import { activeWhere, announce, audit, lockRow, q3 } from './common';
import { postInitialStock } from './initial-stock';

const include = {
  category: { select: { id: true, name: true } },
  reorderRules: { include: { warehouse: { select: { code: true } } }, orderBy: { warehouse: { code: 'asc' } } },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof include }>;

function ruleDto(r: ProductRow['reorderRules'][number]): ReorderRuleDto {
  return { id: r.id, productId: r.productId, warehouseId: r.warehouseId, warehouseCode: r.warehouse.code, minQty: q3(r.minQty), maxQty: q3(r.maxQty) };
}

/** On hand per product, over internal locations in the warehouse (all warehouses when none is given). */
async function onHandOf(db: Tx | typeof prisma, ids: string[], warehouseId?: string): Promise<Map<string, Prisma.Decimal | null>> {
  // Balances only exist for internal locations (posting.ts writes no others).
  const rows = await db.stockQuant.groupBy({
    by: ['productId'],
    where: { productId: { in: ids }, ...(warehouseId ? { location: { warehouseId } } : {}) },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.productId, r._sum.quantity]));
}

async function toDtos(db: Tx | typeof prisma, rows: ProductRow[], warehouseId?: string): Promise<ProductDto[]> {
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];
  const [qty, used, health] = await Promise.all([
    onHandOf(db, ids, warehouseId),
    db.operationLine.groupBy({ by: ['productId'], where: { productId: { in: ids } }, _count: { _all: true } }),
    stockHealth({ productIds: ids, warehouseId }, db),
  ]);
  const status = new Map(health.map((h) => [h.productId, h.status]));
  const onLines = new Set(used.map((r) => r.productId));
  return rows.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    uom: p.uom,
    unitCost: p.unitCost === null ? null : p.unitCost.toFixed(2),
    isActive: p.isActive,
    category: p.category,
    onHand: q3(qty.get(p.id)),
    stockStatus: status.get(p.id) ?? null,
    uomEditable: !onLines.has(p.id),
    reorderRules: p.reorderRules.map(ruleDto),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));
}

export async function listProducts(q: ProductListQuery): Promise<ListResponse<ProductDto>> {
  const where: Prisma.ProductWhereInput = { ...activeWhere(q.active) };
  if (q.categoryId) where.categoryId = q.categoryId;
  if (q.search) where.OR = [{ sku: { contains: q.search, mode: 'insensitive' } }, { name: { contains: q.search, mode: 'insensitive' } }];
  if (q.stockStatus) {
    const wanted = new Set<string>(q.stockStatus);
    const health = await stockHealth({ warehouseId: q.warehouseId, categoryId: q.categoryId });
    where.id = { in: health.filter((h) => wanted.has(h.status)).map((h) => h.productId) };
  }
  const page = { page: q.page, pageSize: q.pageSize };

  if (q.sort === 'onHand' || q.sort === '-onHand') {
    // On hand is computed, so sort in memory; a product catalogue is small enough for that.
    const all = await prisma.product.findMany({ where, select: { id: true, sku: true } });
    const qty = await onHandOf(prisma, all.map((p) => p.id), q.warehouseId);
    const dir = q.sort === 'onHand' ? 1 : -1;
    const ordered = all.sort((a, b) => {
      const d = new Prisma.Decimal(qty.get(a.id) ?? 0).comparedTo(qty.get(b.id) ?? 0);
      return d !== 0 ? d * dir : a.sku.localeCompare(b.sku);
    });
    const ids = ordered.slice((q.page - 1) * q.pageSize, q.page * q.pageSize).map((p) => p.id);
    const rows = await prisma.product.findMany({ where: { id: { in: ids } }, include });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return { data: await toDtos(prisma, ids.map((id) => byId.get(id)!), q.warehouseId), page: { ...page, total: all.length } };
  }

  const [field, dir] = q.sort.startsWith('-') ? [q.sort.slice(1), 'desc' as const] : [q.sort, 'asc' as const];
  const [rows, total] = await Promise.all([
    prisma.product.findMany({ where, include, orderBy: { [field]: dir }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.product.count({ where }),
  ]);
  return { data: await toDtos(prisma, rows, q.warehouseId), page: { ...page, total } };
}

export async function getProduct(id: string, db: Tx | typeof prisma = prisma): Promise<ProductDto> {
  const row = await db.product.findUnique({ where: { id }, include });
  if (!row) throw notFound('Product');
  const [dto] = await toDtos(db, [row]);
  const quants = await db.stockQuant.findMany({
    where: { productId: id },
    include: { location: { include: { warehouse: { select: { code: true } } } } },
  });
  dto!.locations = quants
    .map((q) => ({
      locationId: q.locationId,
      label: q.location.warehouse ? `${q.location.warehouse.code}/${q.location.name}` : q.location.name,
      warehouseId: q.location.warehouseId!,
      onHand: q3(q.quantity),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return dto!;
}

export async function checkCategory(tx: Tx, categoryId: string | null | undefined): Promise<void> {
  if (!categoryId) return;
  const c = await tx.category.findUnique({ where: { id: categoryId } });
  if (!c) throw new AppError('INACTIVE_REFERENCE', 'The category does not exist');
  if (!c.isActive) throw new AppError('INACTIVE_REFERENCE', `The category ${c.name} is archived`);
}

export async function createProduct(actor: Actor, input: ProductCreateInput): Promise<ProductDto & { stockOperations: string[] }> {
  return withTx(async (tx, ctx) => {
    await checkCategory(tx, input.categoryId);
    const p = await tx.product.create({
      data: { sku: input.sku, name: input.name, categoryId: input.categoryId ?? null, uom: input.uom, unitCost: input.unitCost ?? null },
    });
    await audit(tx, actor, 'create', 'product', p.id, null, p);
    const stockOperations = await postInitialStock(
      tx,
      ctx,
      actor,
      (input.initialStock ?? []).map((s) => ({ productId: p.id, locationId: s.locationId, quantity: s.quantity })),
    );
    announce(ctx, actor, { productIds: [p.id] });
    return { ...(await getProduct(p.id, tx)), stockOperations };
  });
}

export async function updateProduct(actor: Actor, id: string, input: ProductUpdateInput): Promise<ProductDto> {
  return withTx(async (tx, ctx) => {
    if (!(await lockRow(tx, 'product', id))) throw notFound('Product');
    const before = await tx.product.findUniqueOrThrow({ where: { id } });
    await assertUomChangeAllowed(tx, before, input.uom);
    if (input.categoryId !== undefined && input.categoryId !== before.categoryId) await checkCategory(tx, input.categoryId);
    const after = await tx.product.update({
      where: { id },
      data: {
        sku: input.sku,
        name: input.name,
        uom: input.uom,
        categoryId: input.categoryId === undefined ? undefined : input.categoryId,
        unitCost: input.unitCost === undefined ? undefined : input.unitCost,
      },
    });
    await audit(tx, actor, 'update', 'product', id, before, after);
    announce(ctx, actor, { productIds: [id] });
    return getProduct(id, tx);
  });
}

/** Posting doesn't re-check decimals on open documents, so the unit is frozen once any line uses the product. */
export async function assertUomChangeAllowed(tx: Tx, product: { id: string; name: string; uom: string }, uom: string | undefined): Promise<void> {
  if (uom === undefined || uom === product.uom) return;
  const lines = await tx.operationLine.count({ where: { productId: product.id } });
  if (lines > 0) {
    throw new AppError('UOM_LOCKED', `${product.name} is already on ${lines} document line${lines > 1 ? 's' : ''}; its unit can't change`, [
      { path: 'uom', message: 'Locked once the product is used' },
    ]);
  }
}

/** Archiving refuses while stock is on hand or an open document still needs the product. */
export async function archiveProduct(actor: Actor, id: string): Promise<ProductDto> {
  return withTx(async (tx, ctx) => {
    if (!(await lockRow(tx, 'product', id))) throw notFound('Product');
    const p = await tx.product.findUniqueOrThrow({ where: { id } });
    const [stock, open] = await Promise.all([
      tx.stockQuant.aggregate({ where: { productId: id }, _sum: { quantity: true } }),
      tx.operation.findMany({
        where: { status: { in: ['DRAFT', 'WAITING', 'READY'] }, lines: { some: { productId: id } } },
        select: { reference: true },
        take: 5,
      }),
    ]);
    const onHand = new Prisma.Decimal(stock._sum.quantity ?? 0);
    if (onHand.gt(0)) {
      throw new AppError('IN_USE', `${p.name} still has ${q3(onHand)} on hand. Adjust it to 0 before archiving.`, { onHand: q3(onHand) });
    }
    if (open.length > 0) {
      throw new AppError('IN_USE', `${p.name} is on open documents (${open.map((o) => o.reference).join(', ')}). Finish or cancel them first.`, {
        references: open.map((o) => o.reference),
      });
    }
    await tx.product.update({ where: { id }, data: { isActive: false } });
    await audit(tx, actor, 'archive', 'product', id, { isActive: true }, { isActive: false });
    announce(ctx, actor, { productIds: [id] });
    return getProduct(id, tx);
  });
}

export async function restoreProduct(actor: Actor, id: string): Promise<ProductDto> {
  return withTx(async (tx, ctx) => {
    if (!(await lockRow(tx, 'product', id))) throw notFound('Product');
    await tx.product.update({ where: { id }, data: { isActive: true } });
    await audit(tx, actor, 'restore', 'product', id, { isActive: false }, { isActive: true });
    announce(ctx, actor, { productIds: [id] });
    return getProduct(id, tx);
  });
}

// ─── Reorder rules ─────────────────────────────────────────────────────────────────────────

/** One rule per product and warehouse: PUT /reorder-rules creates or replaces it. */
export async function upsertReorderRule(actor: Actor, input: ReorderRuleInput): Promise<ReorderRuleDto> {
  const run = async (tx: Tx) => {
    const [product, warehouse] = await Promise.all([
      tx.product.findUnique({ where: { id: input.productId } }),
      tx.warehouse.findUnique({ where: { id: input.warehouseId } }),
    ]);
    if (!product) throw new AppError('INACTIVE_REFERENCE', 'The product does not exist');
    if (!product.isActive) throw new AppError('INACTIVE_REFERENCE', `${product.name} is archived`);
    for (const path of ['minQty', 'maxQty'] as const) {
      if (!fitsUom(input[path], product.uom)) {
        throw new AppError('UOM_PRECISION', `${product.name} (${product.uom.toLowerCase()}) allows at most ${UOM_DECIMALS[product.uom]} decimals`, [
          { path, message: `At most ${UOM_DECIMALS[product.uom]} decimals` },
        ]);
      }
    }
    if (!warehouse) throw new AppError('INACTIVE_REFERENCE', 'The warehouse does not exist');
    if (!warehouse.isActive) throw new AppError('INACTIVE_REFERENCE', `${warehouse.code} is archived`);
    const key = { productId_warehouseId: { productId: input.productId, warehouseId: input.warehouseId } };
    const before = await tx.reorderRule.findUnique({ where: key });
    const rule = await tx.reorderRule.upsert({
      where: key,
      create: { productId: input.productId, warehouseId: input.warehouseId, minQty: input.minQty, maxQty: input.maxQty },
      update: { minQty: input.minQty, maxQty: input.maxQty },
      include: { warehouse: { select: { code: true } } },
    });
    await audit(tx, actor, before ? 'update' : 'create', 'reorder_rule', rule.id, before, rule);
    return ruleDto(rule);
  };
  return withTx(async (tx, ctx) => {
    const dto = await run(tx);
    announce(ctx, actor, { productIds: [dto.productId], warehouseIds: [dto.warehouseId] });
    return dto;
  });
}

export async function deleteReorderRule(actor: Actor, id: string): Promise<void> {
  await withTx(async (tx, ctx) => {
    const rule = await tx.reorderRule.findUnique({ where: { id } });
    if (!rule) throw notFound('Reorder rule');
    await tx.reorderRule.delete({ where: { id: rule.id } });
    await audit(tx, actor, 'delete', 'reorder_rule', rule.id, rule, null);
    announce(ctx, actor, { productIds: [rule.productId], warehouseIds: [rule.warehouseId] });
  });
}
