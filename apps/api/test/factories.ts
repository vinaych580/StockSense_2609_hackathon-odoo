/** Small factories: tests build only what they need, never the demo seed. */
import { SYSTEM_LOCATION_IDS, type OperationCreateInput, type Uom } from '@stocksense/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/db';
import { AppError } from '../src/lib/errors';
import type { Actor } from '../src/inventory/posting';
import { ensureSystemData } from '../src/system/ensure-system-data';
import { createOperation, runAction, type ActionName } from '../src/operations/service';

export const VENDORS = SYSTEM_LOCATION_IDS.VENDOR;
export const CUSTOMERS = SYSTEM_LOCATION_IDS.CUSTOMER;
export const ADJUST = SYSTEM_LOCATION_IDS.ADJUSTMENT;

export async function resetDb(): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
  await ensureSystemData(prisma);
}

let seq = 0;
const next = () => ++seq;

export async function makeUser(role: 'MANAGER' | 'STAFF' = 'MANAGER', name?: string): Promise<Actor> {
  const n = next();
  const u = await prisma.user.create({
    data: { email: `user${n}@stocksense.test`, name: name ?? `${role === 'MANAGER' ? 'Manager' : 'Staff'} ${n}`, passwordHash: 'x', role },
  });
  return { id: u.id, name: u.name, role: u.role };
}

export async function makeWarehouse(code = `W${next()}`) {
  const warehouse = await prisma.warehouse.create({
    data: { code, name: `Warehouse ${code}`, locations: { create: { code: 'STOCK', name: 'Stock' } } },
    include: { locations: true },
  });
  return { warehouse, stock: warehouse.locations[0]! };
}

export async function makeLocation(warehouseId: string, name = `Rack ${next()}`) {
  return prisma.location.create({ data: { warehouseId, code: name.toUpperCase().replace(/\W+/g, '').slice(0, 20), name } });
}

export async function makeProduct(opts: { sku?: string; name?: string; uom?: Uom } = {}) {
  const n = next();
  return prisma.product.create({
    data: { sku: opts.sku ?? `SKU-${n}`, name: opts.name ?? `Product ${n}`, uom: opts.uom ?? 'UNIT' },
  });
}

export async function makePartner(kind: 'SUPPLIER' | 'CUSTOMER') {
  return prisma.partner.create({ data: { name: `${kind} ${next()}`, kind } });
}

export type Line = { productId: string; quantity?: string; countedQuantity?: string };

export function draft(actor: Actor, type: OperationCreateInput['type'], source: string, dest: string, lines: Line[]) {
  return createOperation(actor, { type, sourceLocationId: source, destLocationId: dest, lines });
}

/** Runs an action with the document's current version. */
export async function act(actor: Actor, id: string, action: ActionName, extra: { acknowledgeBalanceChange?: boolean } = {}) {
  const { version } = await prisma.operation.findUniqueOrThrow({ where: { id }, select: { version: true } });
  return runAction(actor, id, action, { version, ...extra });
}

/** Receive stock through a real receipt (Draft → Done in one step). */
export async function receive(actor: Actor, productId: string, locationId: string, quantity: string) {
  const op = await draft(actor, 'RECEIPT', VENDORS, locationId, [{ productId, quantity }]);
  return act(actor, op.id, 'validate');
}

/** A delivery confirmed, picked and packed, ready to validate. */
export async function readyDelivery(actor: Actor, locationId: string, lines: Line[]) {
  const op = await draft(actor, 'DELIVERY', locationId, CUSTOMERS, lines);
  await act(actor, op.id, 'confirm');
  await act(actor, op.id, 'pick');
  await act(actor, op.id, 'pack');
  return prisma.operation.findUniqueOrThrow({ where: { id: op.id } });
}

export async function balance(productId: string, locationId: string): Promise<string> {
  const q = await prisma.stockQuant.findUnique({ where: { productId_locationId: { productId, locationId } } });
  return new Prisma.Decimal(q?.quantity ?? 0).toFixed(3);
}

export async function moveCount(operationId?: string): Promise<number> {
  return prisma.stockMove.count({ where: operationId ? { operationId } : {} });
}

/** Resolves to the AppError code a promise rejected with. */
export async function errorCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
  throw new Error('Expected the call to fail');
}

export async function caught(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppError) return e;
    throw e;
  }
  throw new Error('Expected the call to fail');
}
