/** Helpers shared by the master-data services: audit rows, change events and row locks. */
import { Prisma } from '@prisma/client';
import type { Tx, TxContext } from '../lib/db';
import type { Actor } from '../inventory/posting';

export type Entity = 'product' | 'category' | 'warehouse' | 'location' | 'partner' | 'reorder_rule' | 'user';

/** Plain JSON for the audit log: Decimals become strings, Dates ISO strings. */
function json(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function audit(
  tx: Tx,
  actor: Actor,
  action: string,
  entity: Entity,
  entityId: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await tx.auditLog.create({
    data: { userId: actor.id, action, entity, entityId, before: json(before), after: json(after) },
  });
}

export function announce(ctx: TxContext, actor: Actor, extra: { productIds?: string[]; warehouseIds?: string[] } = {}): void {
  ctx.publishAfterCommit({ type: 'data.changed', entities: ['masterdata'], actorName: actor.name, ...extra });
}

/** Locks one row of a master-data table FOR UPDATE; returns false if it doesn't exist. */
export async function lockRow(tx: Tx, table: 'product' | 'category' | 'warehouse' | 'location' | 'partner', id: string): Promise<boolean> {
  const rows = await tx.$queryRaw<unknown[]>`SELECT 1 FROM ${Prisma.raw(`"${table}"`)} WHERE id = ${id}::uuid FOR UPDATE`;
  return rows.length > 0;
}

export const q3 = (d: Prisma.Decimal | string | number | null | undefined) => new Prisma.Decimal(d ?? 0).toFixed(3);

export function activeWhere(active: 'true' | 'false' | 'all'): { isActive?: boolean } {
  return active === 'all' ? {} : { isActive: active === 'true' };
}
