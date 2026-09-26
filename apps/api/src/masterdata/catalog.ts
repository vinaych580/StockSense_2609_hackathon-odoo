/** Categories, warehouses, locations and contacts: list, create, edit, archive and restore. */
import type {
  CategoryDto,
  CategoryInput,
  ListResponse,
  LocationCreateInput,
  LocationDto,
  LocationListQuery,
  LocationUpdateInput,
  PartnerCreateInput,
  PartnerDto,
  PartnerListQuery,
  PartnerUpdateInput,
  WarehouseCreateInput,
  WarehouseDto,
  WarehouseUpdateInput,
} from '@stocksense/shared';
import { Prisma } from '@prisma/client';
import { prisma, withTx, type Tx } from '../lib/db';
import { AppError, notFound } from '../lib/errors';
import type { Actor } from '../inventory/posting';
import { activeWhere, announce, audit, lockRow, q3 } from './common';

// ─── Categories ────────────────────────────────────────────────────────────────────────────

export async function listCategories(active: 'true' | 'false' | 'all'): Promise<CategoryDto[]> {
  const rows = await prisma.category.findMany({
    where: activeWhere(active),
    include: { _count: { select: { products: true } } },
    orderBy: { name: 'asc' },
  });
  return rows.map((c) => ({ id: c.id, name: c.name, isActive: c.isActive, productCount: c._count.products }));
}

async function categoryDto(tx: Tx, id: string): Promise<CategoryDto> {
  const c = await tx.category.findUniqueOrThrow({ where: { id }, include: { _count: { select: { products: true } } } });
  return { id: c.id, name: c.name, isActive: c.isActive, productCount: c._count.products };
}

/** Category names are unique ignoring case, so "Furniture" and "furniture" can't both exist. */
export async function findCategoryByName(tx: Tx, name: string, exceptId?: string) {
  return tx.category.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) } });
}

function categoryTaken(name: string): AppError {
  return new AppError('ALREADY_EXISTS', `A category named ${name} already exists`, { fields: ['name'] });
}

export async function createCategory(actor: Actor, input: CategoryInput): Promise<CategoryDto> {
  return withTx(async (tx, ctx) => {
    if (await findCategoryByName(tx, input.name)) throw categoryTaken(input.name);
    const c = await tx.category.create({ data: { name: input.name } });
    await audit(tx, actor, 'create', 'category', c.id, null, c);
    announce(ctx, actor);
    return categoryDto(tx, c.id);
  });
}

export async function updateCategory(actor: Actor, id: string, input: CategoryInput): Promise<CategoryDto> {
  return withTx(async (tx, ctx) => {
    if (!(await lockRow(tx, 'category', id))) throw notFound('Category');
    if (await findCategoryByName(tx, input.name, id)) throw categoryTaken(input.name);
    const before = await tx.category.findUniqueOrThrow({ where: { id } });
    const after = await tx.category.update({ where: { id }, data: { name: input.name } });
    await audit(tx, actor, 'update', 'category', id, before, after);
    announce(ctx, actor);
    return categoryDto(tx, id);
  });
}

/** Products keep an archived category; it just can't be chosen for new ones. */
export async function setCategoryActive(actor: Actor, id: string, isActive: boolean): Promise<CategoryDto> {
  return withTx(async (tx, ctx) => {
    if (!(await lockRow(tx, 'category', id))) throw notFound('Category');
    await tx.category.update({ where: { id }, data: { isActive } });
    await audit(tx, actor, isActive ? 'restore' : 'archive', 'category', id, { isActive: !isActive }, { isActive });
    announce(ctx, actor);
    return categoryDto(tx, id);
  });
}

// ─── Locations ─────────────────────────────────────────────────────────────────────────────

const locationInclude = { warehouse: { select: { code: true, isActive: true } } } satisfies Prisma.LocationInclude;
type LocationRow = Prisma.LocationGetPayload<{ include: typeof locationInclude }>;

function locationDto(l: LocationRow): LocationDto {
  return {
    id: l.id,
    code: l.code,
    name: l.name,
    label: l.warehouse ? `${l.warehouse.code}/${l.name}` : l.name,
    type: l.type,
    warehouseId: l.warehouseId,
    isActive: l.isActive && (l.warehouse?.isActive ?? true),
  };
}

export async function listLocations(q: LocationListQuery): Promise<LocationDto[]> {
  const where: Prisma.LocationWhereInput = q.includeVirtual ? {} : { type: 'INTERNAL' };
  if (q.warehouseId) where.warehouseId = q.warehouseId;
  // "Active" means usable: the location and its warehouse are both active.
  if (q.active === 'true') where.AND = [{ isActive: true }, { OR: [{ warehouseId: null }, { warehouse: { isActive: true } }] }];
  if (q.active === 'false') where.OR = [{ isActive: false }, { warehouse: { isActive: false } }];
  const rows = await prisma.location.findMany({ where, include: locationInclude, orderBy: [{ type: 'asc' }, { warehouse: { code: 'asc' } }, { code: 'asc' }] });
  return rows.map(locationDto);
}

async function getLocation(tx: Tx, id: string): Promise<LocationDto> {
  return locationDto(await tx.location.findUniqueOrThrow({ where: { id }, include: locationInclude }));
}

/** Locks an internal location; the three virtual ones belong to the system. */
async function lockInternalLocation(tx: Tx, id: string) {
  if (!(await lockRow(tx, 'location', id))) throw notFound('Location');
  const l = await tx.location.findUniqueOrThrow({ where: { id }, include: locationInclude });
  if (l.type !== 'INTERNAL') throw new AppError('FORBIDDEN', `${l.name} is a system location and can't be changed`);
  return l;
}

async function stockAt(tx: Tx, locationIds: string[]): Promise<Prisma.Decimal> {
  const s = await tx.stockQuant.aggregate({ where: { locationId: { in: locationIds } }, _sum: { quantity: true } });
  return new Prisma.Decimal(s._sum.quantity ?? 0);
}

export async function createLocation(actor: Actor, input: LocationCreateInput): Promise<LocationDto> {
  return withTx(async (tx, ctx) => {
    const w = await tx.warehouse.findUnique({ where: { id: input.warehouseId } });
    if (!w) throw new AppError('INACTIVE_REFERENCE', 'The warehouse does not exist');
    if (!w.isActive) throw new AppError('INACTIVE_REFERENCE', `${w.code} is archived`);
    const l = await tx.location.create({ data: { warehouseId: w.id, code: input.code, name: input.name, type: 'INTERNAL' } });
    await audit(tx, actor, 'create', 'location', l.id, null, l);
    announce(ctx, actor, { warehouseIds: [w.id] });
    return getLocation(tx, l.id);
  });
}

/** Only code and name change: a location's type and warehouse are fixed at creation. */
export async function updateLocation(actor: Actor, id: string, input: LocationUpdateInput): Promise<LocationDto> {
  return withTx(async (tx, ctx) => {
    const before = await lockInternalLocation(tx, id);
    const after = await tx.location.update({ where: { id }, data: { code: input.code, name: input.name } });
    await audit(tx, actor, 'update', 'location', id, before, after);
    announce(ctx, actor, { warehouseIds: before.warehouseId ? [before.warehouseId] : [] });
    return getLocation(tx, id);
  });
}

export async function setLocationActive(actor: Actor, id: string, isActive: boolean): Promise<LocationDto> {
  return withTx(async (tx, ctx) => {
    const l = await lockInternalLocation(tx, id);
    if (!isActive) {
      const onHand = await stockAt(tx, [id]);
      if (onHand.gt(0)) throw new AppError('IN_USE', `${l.name} still holds ${q3(onHand)} units of stock. Move or adjust it out first.`);
    } else if (l.warehouse && !l.warehouse.isActive) {
      throw new AppError('INACTIVE_REFERENCE', `Restore warehouse ${l.warehouse.code} first`);
    }
    await tx.location.update({ where: { id }, data: { isActive } });
    await audit(tx, actor, isActive ? 'restore' : 'archive', 'location', id, { isActive: !isActive }, { isActive });
    announce(ctx, actor, { warehouseIds: l.warehouseId ? [l.warehouseId] : [] });
    return getLocation(tx, id);
  });
}

// ─── Warehouses ────────────────────────────────────────────────────────────────────────────

async function warehouseDtos(db: Tx | typeof prisma, where: Prisma.WarehouseWhereInput): Promise<WarehouseDto[]> {
  const rows = await db.warehouse.findMany({
    where,
    include: { locations: { include: locationInclude, orderBy: { code: 'asc' } }, _count: { select: { operations: true } } },
    orderBy: { code: 'asc' },
  });
  return rows.map((w) => ({
    id: w.id,
    code: w.code,
    name: w.name,
    address: w.address,
    isActive: w.isActive,
    codeEditable: w._count.operations === 0,
    locations: w.locations.map(locationDto),
  }));
}

export async function listWarehouses(active: 'true' | 'false' | 'all'): Promise<WarehouseDto[]> {
  return warehouseDtos(prisma, activeWhere(active));
}

export async function getWarehouse(id: string, db: Tx | typeof prisma = prisma): Promise<WarehouseDto> {
  const [w] = await warehouseDtos(db, { id });
  if (!w) throw notFound('Warehouse');
  return w;
}

/** A new warehouse comes with its main Stock location, where receipts land by default. */
export async function createWarehouse(actor: Actor, input: WarehouseCreateInput): Promise<WarehouseDto> {
  return withTx(async (tx, ctx) => {
    const w = await tx.warehouse.create({
      data: { code: input.code, name: input.name, address: input.address, locations: { create: { code: 'STOCK', name: 'Stock', type: 'INTERNAL' } } },
    });
    await audit(tx, actor, 'create', 'warehouse', w.id, null, w);
    announce(ctx, actor, { warehouseIds: [w.id] });
    return getWarehouse(w.id, tx);
  });
}

export async function updateWarehouse(actor: Actor, id: string, input: WarehouseUpdateInput): Promise<WarehouseDto> {
  return withTx(async (tx, ctx) => {
    if (!(await lockRow(tx, 'warehouse', id))) throw notFound('Warehouse');
    const before = await tx.warehouse.findUniqueOrThrow({ where: { id } });
    // References like WH1/IN/00001 embed the code; a reused code would collide with old references.
    if (input.code !== undefined && input.code !== before.code && (await tx.operation.count({ where: { warehouseId: id } })) > 0) {
      throw new AppError('IN_USE', `${before.code} already has documents, so its code can't change`, [
        { path: 'code', message: 'Locked once the warehouse has documents' },
      ]);
    }
    const after = await tx.warehouse.update({ where: { id }, data: { code: input.code, name: input.name, address: input.address } });
    await audit(tx, actor, 'update', 'warehouse', id, before, after);
    announce(ctx, actor, { warehouseIds: [id] });
    return getWarehouse(id, tx);
  });
}

/**
 * Archiving locks every location of the warehouse FOR UPDATE (posting holds them FOR SHARE), refuses
 * while any holds stock, and archives them with it. Restoring brings the warehouse and its locations back.
 */
export async function setWarehouseActive(actor: Actor, id: string, isActive: boolean): Promise<WarehouseDto> {
  return withTx(async (tx, ctx) => {
    if (!(await lockRow(tx, 'warehouse', id))) throw notFound('Warehouse');
    const w = await tx.warehouse.findUniqueOrThrow({ where: { id } });
    const locs = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM location WHERE warehouse_id = ${id}::uuid ORDER BY id FOR UPDATE`;
    if (!isActive) {
      const onHand = await stockAt(tx, locs.map((l) => l.id));
      if (onHand.gt(0)) throw new AppError('IN_USE', `${w.code} still holds stock (${q3(onHand)} in total). Move or adjust it out first.`);
    }
    await tx.warehouse.update({ where: { id }, data: { isActive } });
    await tx.location.updateMany({ where: { warehouseId: id }, data: { isActive } });
    await audit(tx, actor, isActive ? 'restore' : 'archive', 'warehouse', id, { isActive: !isActive }, { isActive });
    announce(ctx, actor, { warehouseIds: [id] });
    return getWarehouse(id, tx);
  });
}

// ─── Contacts ──────────────────────────────────────────────────────────────────────────────

function partnerDto(p: Prisma.PartnerGetPayload<object>): PartnerDto {
  return { id: p.id, name: p.name, kind: p.kind, email: p.email, phone: p.phone, address: p.address, isActive: p.isActive };
}

export async function listPartners(q: PartnerListQuery): Promise<ListResponse<PartnerDto>> {
  const where: Prisma.PartnerWhereInput = { ...activeWhere(q.active) };
  if (q.kind) where.kind = q.kind;
  if (q.search) where.OR = [{ name: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }];
  const [rows, total] = await Promise.all([
    prisma.partner.findMany({ where, orderBy: { name: 'asc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.partner.count({ where }),
  ]);
  return { data: rows.map(partnerDto), page: { page: q.page, pageSize: q.pageSize, total } };
}

export async function getPartner(id: string): Promise<PartnerDto> {
  const p = await prisma.partner.findUnique({ where: { id } });
  if (!p) throw notFound('Contact');
  return partnerDto(p);
}

export async function createPartner(actor: Actor, input: PartnerCreateInput): Promise<PartnerDto> {
  return withTx(async (tx, ctx) => {
    const p = await tx.partner.create({ data: { ...input, email: input.email ?? null } });
    await audit(tx, actor, 'create', 'partner', p.id, null, p);
    announce(ctx, actor);
    return partnerDto(p);
  });
}

/** A contact's kind is fixed once documents use it: a receipt's supplier must stay a supplier. */
export async function updatePartner(actor: Actor, id: string, input: PartnerUpdateInput): Promise<PartnerDto> {
  return withTx(async (tx, ctx) => {
    if (!(await lockRow(tx, 'partner', id))) throw notFound('Contact');
    const before = await tx.partner.findUniqueOrThrow({ where: { id } });
    if (input.kind !== undefined && input.kind !== before.kind && (await tx.operation.count({ where: { partnerId: id } })) > 0) {
      throw new AppError('IN_USE', `${before.name} is already on documents, so it can't change from ${before.kind.toLowerCase()}`, [
        { path: 'kind', message: 'Locked once the contact is used' },
      ]);
    }
    const after = await tx.partner.update({ where: { id }, data: input });
    await audit(tx, actor, 'update', 'partner', id, before, after);
    announce(ctx, actor);
    return partnerDto(after);
  });
}

export async function setPartnerActive(actor: Actor, id: string, isActive: boolean): Promise<PartnerDto> {
  return withTx(async (tx, ctx) => {
    if (!(await lockRow(tx, 'partner', id))) throw notFound('Contact');
    const p = await tx.partner.update({ where: { id }, data: { isActive } });
    await audit(tx, actor, isActive ? 'restore' : 'archive', 'partner', id, { isActive: !isActive }, { isActive });
    announce(ctx, actor);
    return partnerDto(p);
  });
}
