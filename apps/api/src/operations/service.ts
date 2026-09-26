/**
 * The operation state machine. Every transition runs in one transaction: lock the operation row,
 * check permission (on the stored type, never one from the request), status, then version; apply
 * the change; bump the version. Only validate changes stock, and only through post().
 */
import {
  canOperate,
  canTransition,
  checkLinesForType,
  fitsUom,
  INTERNAL_END,
  OPERATION_REF_CODE,
  OUTGOING_TYPES,
  PARTNER_RULES,
  UOM_DECIMALS,
  type OperationAction,
  type OperationActionInput,
  type OperationActionResponse,
  type OperationCapability,
  type OperationCreateInput,
  type OperationLineInput,
  type OperationType,
  type OperationUpdateInput,
} from '@stocksense/shared';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { withTx, type Tx, type TxContext } from '../lib/db';
import { AppError } from '../lib/errors';
import { lockOperation, post, type Actor, type OpRow, type PostOptions, type PostResult } from '../inventory/posting';
import { balancesAt, checkLocation, lockReferences, type LocationRef } from '../inventory/references';
import { getOperation, type OperationDto } from './dto';

const TYPE_NOUN: Record<OperationType, string> = {
  RECEIPT: 'receipts',
  DELIVERY: 'deliveries',
  TRANSFER: 'transfers',
  ADJUSTMENT: 'adjustments',
};

function requireCapability(actor: Actor, capability: OperationCapability, type: OperationType): void {
  if (!canOperate(actor.role, capability, type)) {
    const verb = capability === 'check-availability' ? 'check availability on' : capability.replace(/-/g, ' ');
    throw new AppError(
      'FORBIDDEN',
      `${actor.role === 'STAFF' ? 'Staff' : 'Managers'} can't ${verb} ${TYPE_NOUN[type]}`,
      { permission: `operation.${capability}`, type },
    );
  }
}

// ─── Create ────────────────────────────────────────────────────────────────────────────────

export async function createOperation(actor: Actor, input: OperationCreateInput): Promise<OperationDto> {
  return withTx(async (tx, ctx) => {
    const id = await createInTx(tx, actor, input);
    ctx.publishAfterCommit({ type: 'data.changed', entities: ['operation'], operationId: id, version: 0, actorName: actor.name });
    return getOperation(id, tx);
  });
}

/** Creates a Draft. Used directly by product creation (initial stock) inside its own transaction. */
export async function createInTx(tx: Tx, actor: Actor, input: OperationCreateInput): Promise<string> {
  requireCapability(actor, 'create', input.type);

  const [source, dest] = await Promise.all([loadLocation(tx, input.sourceLocationId), loadLocation(tx, input.destLocationId)]);
  checkLocation(input.type, 'source', source);
  checkLocation(input.type, 'dest', dest);
  await checkPartner(tx, input.type, input.partnerId);
  await checkResponsible(tx, input.responsibleId);
  await checkProducts(tx, input.lines);

  const warehouseId = (INTERNAL_END[input.type] === 'source' ? source : dest)!.warehouse_id!;
  const reference = await nextReference(tx, warehouseId, input.type);
  const counted = input.type === 'ADJUSTMENT' ? await balancesAt(tx, dest!.id, input.lines.map((l) => l.productId)) : null;

  const op = await tx.operation.create({
    data: {
      reference,
      type: input.type,
      warehouseId,
      sourceLocationId: source!.id,
      destLocationId: dest!.id,
      partnerId: input.partnerId ?? null,
      responsibleId: input.responsibleId ?? null,
      scheduledDate: input.scheduledDate ?? null,
      notes: input.notes ?? null,
      createdById: actor.id,
      lines: {
        create: input.lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity ?? null,
          countedQuantity: l.countedQuantity ?? null,
          balanceAtCount: counted?.get(l.productId) ?? null,
        })),
      },
    },
    select: { id: true },
  });
  return op.id;
}

// ─── Edit (Draft only) ─────────────────────────────────────────────────────────────────────

export async function updateOperation(actor: Actor, id: string, input: OperationUpdateInput): Promise<OperationDto> {
  return withTx(async (tx, ctx) => {
    const op = await lockForAction(tx, actor, id, 'edit', input.version);
    const issues = z.object({}).superRefine((_, c) => checkLinesForType(op.type, input.lines, c)).safeParse({});
    if (!issues.success) {
      throw new AppError(
        'VALIDATION_FAILED',
        issues.error.issues[0]?.message ?? 'Invalid lines',
        issues.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }

    // Re-check only the references that changed, so a Draft still saves after, say, a partner is archived.
    const current = await tx.operation.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    let source: LocationRef | undefined;
    let dest: LocationRef | undefined;
    if (input.sourceLocationId !== current.sourceLocationId) {
      source = await loadLocation(tx, input.sourceLocationId);
      checkLocation(op.type, 'source', source);
    }
    if (input.destLocationId !== current.destLocationId) {
      dest = await loadLocation(tx, input.destLocationId);
      checkLocation(op.type, 'dest', dest);
    }
    if ((input.partnerId ?? null) !== current.partnerId) await checkPartner(tx, op.type, input.partnerId);
    if ((input.responsibleId ?? null) !== current.responsibleId) await checkResponsible(tx, input.responsibleId);
    const existing = new Map(current.lines.map((l) => [l.productId, l]));
    await checkProducts(tx, input.lines, new Set(existing.keys()));

    let warehouseId = current.warehouseId;
    const internalEnd = INTERNAL_END[op.type] === 'source' ? source : dest;
    if (internalEnd) warehouseId = internalEnd.warehouse_id!;

    // An adjustment line records the balance when its count is entered (or its location changes).
    const recount = op.type === 'ADJUSTMENT';
    const destChanged = dest !== undefined;
    const balances = recount ? await balancesAt(tx, input.destLocationId, input.lines.map((l) => l.productId)) : null;

    const keep = new Set(input.lines.map((l) => l.productId));
    const removed = current.lines.filter((l) => !keep.has(l.productId)).map((l) => l.id);
    if (removed.length) await tx.operationLine.deleteMany({ where: { id: { in: removed } } });
    for (const l of input.lines) {
      const prev = existing.get(l.productId);
      const counted = l.countedQuantity ?? null;
      const countChanged = !prev || !sameDecimal(prev.countedQuantity, counted);
      const balanceAtCount = recount
        ? countChanged || destChanged
          ? balances!.get(l.productId)!
          : prev!.balanceAtCount
        : null;
      const data = { quantity: l.quantity ?? null, countedQuantity: counted, balanceAtCount };
      if (prev) await tx.operationLine.update({ where: { id: prev.id }, data });
      else await tx.operationLine.create({ data: { ...data, operationId: id, productId: l.productId } });
    }

    const updated = await tx.operation.update({
      where: { id },
      data: {
        sourceLocationId: input.sourceLocationId,
        destLocationId: input.destLocationId,
        warehouseId,
        partnerId: input.partnerId ?? null,
        responsibleId: input.responsibleId ?? null,
        scheduledDate: input.scheduledDate ?? null,
        notes: input.notes ?? null,
        version: { increment: 1 },
      },
      select: { version: true },
    });
    ctx.publishAfterCommit({ type: 'data.changed', entities: ['operation'], operationId: id, version: updated.version, actorName: actor.name });
    return getOperation(id, tx);
  });
}

// ─── Actions ───────────────────────────────────────────────────────────────────────────────

export type ActionName = Exclude<OperationAction, 'edit'>;

/** The response of every action; the shape lives in packages/shared. */
export type ActionResult = OperationActionResponse;

export async function runAction(
  actor: Actor,
  id: string,
  action: ActionName,
  input: OperationActionInput,
  internal: Pick<PostOptions, 'doneAt'> = {},
): Promise<ActionResult> {
  return withTx((tx, ctx) => runActionInTx(tx, ctx, actor, id, action, input, internal));
}

export async function runActionInTx(
  tx: Tx,
  ctx: TxContext,
  actor: Actor,
  id: string,
  action: ActionName,
  input: OperationActionInput,
  internal: Pick<PostOptions, 'doneAt'> = {},
): Promise<ActionResult> {
  const locked = await lockOperation(tx, id);
  if (!locked) throw new AppError('NOT_FOUND', 'Operation not found');

  // A retry after a lost response: the same user validated it already, so report success.
  if (action === 'validate' && locked.status === 'DONE' && locked.validated_by === actor.id) {
    requireCapability(actor, action, locked.type);
    return { operation: await getOperation(id, tx), replayed: true };
  }
  const op = await checkLocked(tx, actor, locked, action, input.version);

  let posted: PostResult | undefined;
  const now = new Date();
  switch (action) {
    case 'confirm': {
      const status = await confirmChecks(tx, op);
      await bump(tx, id, { status });
      break;
    }
    case 'check-availability': {
      const status = (await linesFit(tx, op)) ? 'READY' : 'WAITING';
      await bump(tx, id, { status });
      break;
    }
    case 'reset-to-draft':
      await bump(tx, id, { status: 'DRAFT', pickedAt: null, packedAt: null });
      break;
    case 'pick':
      await bump(tx, id, { pickedAt: now });
      break;
    case 'unpick':
      await bump(tx, id, { pickedAt: null, packedAt: null });
      break;
    case 'pack':
      if (!op.picked_at) throw new AppError('NOT_READY', `Pick ${op.reference} before packing it`);
      await bump(tx, id, { packedAt: now });
      break;
    case 'unpack':
      await bump(tx, id, { packedAt: null });
      break;
    case 'cancel':
      await bump(tx, id, { status: 'CANCELED', canceledById: actor.id, canceledAt: now });
      break;
    case 'validate': {
      if (op.status === 'DRAFT') await confirmChecks(tx, op);
      if (op.type === 'DELIVERY' && (!op.picked_at || !op.packed_at)) {
        throw new AppError('NOT_READY', `Mark ${op.reference} picked and packed before validating`, {
          picked: !!op.picked_at,
          packed: !!op.packed_at,
        });
      }
      posted = await post(tx, id, actor, { doneAt: internal.doneAt, acknowledgeBalanceChange: input.acknowledgeBalanceChange });
      break;
    }
  }

  const operation = await getOperation(id, tx);
  ctx.publishAfterCommit({
    type: 'data.changed',
    entities: posted ? ['operation', 'stock'] : ['operation'],
    operationId: id,
    version: operation.version,
    productIds: posted?.productIds,
    warehouseIds: posted?.warehouseIds,
    actorName: actor.name,
  });
  return { operation, posted };
}

/** Lock, then permission (stored type), then status, then version. */
async function lockForAction(tx: Tx, actor: Actor, id: string, action: OperationAction, version: number): Promise<OpRow> {
  const locked = await lockOperation(tx, id);
  if (!locked) throw new AppError('NOT_FOUND', 'Operation not found');
  return checkLocked(tx, actor, locked, action, version);
}

async function checkLocked(tx: Tx, actor: Actor, op: OpRow, action: OperationAction, version: number): Promise<OpRow> {
  requireCapability(actor, action, op.type);
  if (!canTransition(action, op.type, op.status)) {
    throw new AppError('INVALID_TRANSITION', await transitionMessage(tx, op, action), {
      status: op.status,
      action,
    });
  }
  if (op.version !== version) {
    throw new AppError('STALE_VERSION', `${op.reference} was changed by someone else. Reload to see their changes.`, {
      currentVersion: op.version,
    });
  }
  return op;
}

async function transitionMessage(tx: Tx, op: OpRow, action: OperationAction): Promise<string> {
  if (op.status === 'DONE' && op.validated_by) {
    const by = await tx.user.findUnique({ where: { id: op.validated_by }, select: { name: true } });
    const at = op.validated_at
      ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: process.env.APP_TIMEZONE ?? 'Asia/Kolkata' }).format(op.validated_at)
      : '';
    return `Already validated by ${by?.name ?? 'someone'}${at ? ` at ${at}` : ''}`;
  }
  const status = op.status.charAt(0) + op.status.slice(1).toLowerCase();
  if (action === 'validate' && op.status === 'DRAFT') return `Confirm ${op.reference} before validating it`;
  return `${op.reference} is ${status}, so it can't be ${pastTense(action)}`;
}

function pastTense(action: OperationAction): string {
  const map: Record<OperationAction, string> = {
    edit: 'edited',
    confirm: 'confirmed',
    'check-availability': 'rechecked',
    'reset-to-draft': 'reset to draft',
    pick: 'picked',
    unpick: 'unpicked',
    pack: 'packed',
    unpack: 'unpacked',
    validate: 'validated',
    cancel: 'canceled',
  };
  return map[action];
}

/** At least one line, active references, then Ready (or Waiting when an outgoing line doesn't fit). */
async function confirmChecks(tx: Tx, op: OpRow): Promise<'READY' | 'WAITING'> {
  const lines = await tx.operationLine.findMany({ where: { operationId: op.id }, select: { productId: true } });
  if (lines.length === 0) throw new AppError('NOT_READY', `Add at least one line to ${op.reference}`);
  await lockReferences(tx, op.type, op.source_location_id, op.dest_location_id, lines.map((l) => l.productId).sort());
  if (!OUTGOING_TYPES.includes(op.type)) return 'READY';
  return (await linesFit(tx, op)) ? 'READY' : 'WAITING';
}

/** "Available when last checked": no reservation, no lock. Validate is the only hard check. */
async function linesFit(tx: Tx, op: OpRow): Promise<boolean> {
  const lines = await tx.operationLine.findMany({ where: { operationId: op.id }, select: { productId: true, quantity: true } });
  const balances = await balancesAt(tx, op.source_location_id, lines.map((l) => l.productId));
  return lines.every((l) => !balances.get(l.productId)!.lessThan(l.quantity ?? 0));
}

async function bump(tx: Tx, id: string, data: Prisma.OperationUncheckedUpdateInput): Promise<void> {
  await tx.operation.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
}

// ─── Reference checks ──────────────────────────────────────────────────────────────────────

async function loadLocation(tx: Tx, id: string): Promise<LocationRef | undefined> {
  const rows = await tx.$queryRaw<LocationRef[]>`
    SELECT l.id::text, l.type::text AS type, l.is_active, l.warehouse_id::text AS warehouse_id,
           CASE WHEN w.code IS NULL THEN l.name ELSE w.code || '/' || l.name END AS label
    FROM location l LEFT JOIN warehouse w ON w.id = l.warehouse_id
    WHERE l.id = ${id}::uuid`;
  return rows[0];
}

async function checkPartner(tx: Tx, type: OperationType, partnerId: string | null | undefined): Promise<void> {
  if (!partnerId) return;
  const kind = PARTNER_RULES[type];
  if (!kind) throw new AppError('VALIDATION_FAILED', `${TYPE_NOUN[type]} don't take a contact`, [{ path: 'partnerId', message: 'Remove the contact' }]);
  const partner = await tx.partner.findUnique({ where: { id: partnerId } });
  if (!partner) throw new AppError('INACTIVE_REFERENCE', 'The contact does not exist');
  if (!partner.isActive) throw new AppError('INACTIVE_REFERENCE', `${partner.name} is archived`);
  if (partner.kind !== kind) {
    throw new AppError('VALIDATION_FAILED', `${partner.name} is not a ${kind.toLowerCase()}`, [
      { path: 'partnerId', message: `Choose a ${kind.toLowerCase()}` },
    ]);
  }
}

async function checkResponsible(tx: Tx, userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  const user = await tx.user.findUnique({ where: { id: userId }, select: { isActive: true, name: true } });
  if (!user) throw new AppError('INACTIVE_REFERENCE', 'The responsible user does not exist');
  if (!user.isActive) throw new AppError('INACTIVE_REFERENCE', `${user.name} is deactivated`);
}

/** Products exist, new ones are active, and every quantity fits the product's unit of measure. */
async function checkProducts(tx: Tx, lines: OperationLineInput[], alreadyOnDocument = new Set<string>()): Promise<void> {
  if (lines.length === 0) return;
  const products = await tx.product.findMany({ where: { id: { in: lines.map((l) => l.productId) } } });
  const byId = new Map(products.map((p) => [p.id, p]));
  lines.forEach((l, i) => {
    const p = byId.get(l.productId);
    if (!p) throw new AppError('INACTIVE_REFERENCE', 'A line refers to a product that does not exist', { line: i });
    if (!p.isActive && !alreadyOnDocument.has(p.id)) throw new AppError('INACTIVE_REFERENCE', `${p.name} (${p.sku}) is archived`, { line: i });
    const value = l.quantity ?? l.countedQuantity;
    if (value !== undefined && !fitsUom(value, p.uom)) {
      const places = UOM_DECIMALS[p.uom];
      throw new AppError(
        'UOM_PRECISION',
        places === 0
          ? `${p.name} is counted in whole ${p.uom === 'BOX' ? 'boxes' : 'units'}`
          : `Quantity for ${p.name} (${p.uom.toLowerCase()}) allows at most ${places} decimals`,
        [{ path: `lines.${i}.${l.quantity !== undefined ? 'quantity' : 'countedQuantity'}`, message: `At most ${places} decimals` }],
      );
    }
  });
}

/** Gap-free readable ids like WH1/OUT/00007: a counter row per (warehouse, type), created on first use. */
async function nextReference(tx: Tx, warehouseId: string, type: OperationType): Promise<string> {
  const [row] = await tx.$queryRaw<Array<{ n: number; code: string }>>`
    WITH c AS (
      INSERT INTO sequence_counter (warehouse_id, type, next)
      VALUES (${warehouseId}::uuid, ${type}::operation_type, 2)
      ON CONFLICT (warehouse_id, type) DO UPDATE SET next = sequence_counter.next + 1
      RETURNING next - 1 AS n
    )
    SELECT c.n::int AS n, w.code FROM c, warehouse w WHERE w.id = ${warehouseId}::uuid`;
  if (!row) throw new AppError('INACTIVE_REFERENCE', 'Warehouse not found');
  return `${row.code}/${OPERATION_REF_CODE[type]}/${String(row.n).padStart(5, '0')}`;
}

function sameDecimal(a: Prisma.Decimal | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return new Prisma.Decimal(a).equals(b);
}
