/**
 * The only module allowed to write stock_move or stock_quant. Initial stock, receipts,
 * deliveries, transfers and adjustments all post through post().
 *
 * Lock protocol (the global order every transaction follows, so no lock cycle can form):
 *   operation row FOR UPDATE → products FOR SHARE (sorted) → locations FOR SHARE →
 *   create missing balance rows at 0 (sorted) → every balance key FOR UPDATE (sorted) →
 *   compute in memory → write.
 */
import type { ChangedBalance, OperationStatus, OperationType, ShortLine } from '@stocksense/shared';
import { Prisma } from '@prisma/client';
import type { Tx } from '../lib/db';
import { AppError } from '../lib/errors';
import { lockReferences, type LocationRef } from './references';

export interface Actor {
  id: string;
  name: string;
  role: 'MANAGER' | 'STAFF';
}

export interface PostOptions {
  /** Only the seed may pass this, to spread Move History over realistic dates. */
  doneAt?: Date;
  /** Adjustments: post counted − current even though the balance moved since counting. */
  acknowledgeBalanceChange?: boolean;
}

export interface PostResult {
  movesPosted: number;
  /** Adjustment lines whose count matched the balance, so nothing was posted. */
  unchangedLines: number;
  productIds: string[];
  warehouseIds: string[];
}

export interface OpRow {
  id: string;
  reference: string;
  type: OperationType;
  status: OperationStatus;
  source_location_id: string;
  dest_location_id: string;
  version: number;
  validated_by: string | null;
  validated_at: Date | null;
  picked_at: Date | null;
  packed_at: Date | null;
}

interface LineRow {
  id: string;
  product_id: string;
  quantity: Prisma.Decimal | null;
  counted_quantity: Prisma.Decimal | null;
  balance_at_count: Prisma.Decimal | null;
}

const ZERO = new Prisma.Decimal(0);
const keyOf = (productId: string, locationId: string) => `${productId}|${locationId}`;
const fmt = (d: Prisma.Decimal) => d.toFixed(3);

/** Locks the operation row. Re-locking a row this transaction already holds is a no-op. */
export async function lockOperation(tx: Tx, operationId: string): Promise<OpRow | undefined> {
  const rows = await tx.$queryRaw<OpRow[]>`
    SELECT id::text, reference, type::text AS type, status::text AS status,
           source_location_id::text, dest_location_id::text, version,
           validated_by::text, validated_at, picked_at, packed_at
    FROM operation WHERE id = ${operationId}::uuid FOR UPDATE`;
  return rows[0];
}

/**
 * Posts a document's lines to the ledger and balances, and marks it Done. The caller has
 * already locked the operation and checked permission, status and version. Throws (rolling
 * back the whole transaction) on INSUFFICIENT_STOCK, BALANCE_CHANGED or INACTIVE_REFERENCE.
 */
export async function post(tx: Tx, operationId: string, actor: Actor, opts: PostOptions = {}): Promise<PostResult> {
  const op = await lockOperation(tx, operationId);
  if (!op) throw new AppError('NOT_FOUND', 'Operation not found');

  const lines = await tx.$queryRaw<LineRow[]>`
    SELECT id::text, product_id::text, quantity, counted_quantity, balance_at_count
    FROM operation_line WHERE operation_id = ${operationId}::uuid ORDER BY product_id`;
  if (lines.length === 0) throw new AppError('NOT_READY', `${op.reference} has no lines`);

  const { products, source, dest } = await lockReferences(
    tx,
    op.type,
    op.source_location_id,
    op.dest_location_id,
    lines.map((l) => l.product_id),
  );

  // Every internal (product, location) key the document touches, sources and destinations together.
  const internal = (loc: LocationRef) => loc.type === 'INTERNAL';
  const keys: Array<{ productId: string; locationId: string }> = [];
  for (const l of lines) {
    if (internal(source)) keys.push({ productId: l.product_id, locationId: source.id });
    if (internal(dest)) keys.push({ productId: l.product_id, locationId: dest.id });
  }
  keys.sort((a, b) =>
    a.productId === b.productId ? cmp(a.locationId, b.locationId) : cmp(a.productId, b.productId),
  );

  const balances = await lockBalances(tx, keys);

  // Compute every new balance in memory before writing anything.
  const moves: Array<{ lineId: string; productId: string; from: string; to: string; qty: Prisma.Decimal }> = [];
  const posted = new Map<string, Prisma.Decimal>();
  const shorts: ShortLine[] = [];
  const changed: ChangedBalance[] = [];
  let unchangedLines = 0;

  for (const l of lines) {
    const p = products.get(l.product_id)!;
    if (op.type === 'ADJUSTMENT') {
      const k = keyOf(l.product_id, dest.id);
      const current = balances.get(k)!;
      const counted = new Prisma.Decimal(l.counted_quantity ?? 0);
      if (l.balance_at_count !== null && !current.equals(l.balance_at_count) && !opts.acknowledgeBalanceChange) {
        changed.push({
          productId: p.id,
          sku: p.sku,
          productName: p.name,
          counted: fmt(counted),
          balanceAtCount: fmt(new Prisma.Decimal(l.balance_at_count)),
          currentBalance: fmt(current),
        });
        continue;
      }
      const diff = counted.minus(current);
      posted.set(l.id, diff);
      balances.set(k, counted);
      if (diff.isZero()) unchangedLines++;
      else if (diff.isPositive()) moves.push({ lineId: l.id, productId: p.id, from: source.id, to: dest.id, qty: diff });
      else moves.push({ lineId: l.id, productId: p.id, from: dest.id, to: source.id, qty: diff.negated() });
      continue;
    }

    const qty = new Prisma.Decimal(l.quantity ?? 0);
    if (internal(source)) {
      const k = keyOf(l.product_id, source.id);
      const next = balances.get(k)!.minus(qty);
      if (next.isNegative()) {
        shorts.push({
          productId: p.id,
          sku: p.sku,
          productName: p.name,
          locationId: source.id,
          locationName: source.label,
          requested: fmt(qty),
          available: fmt(balances.get(k)!),
        });
      }
      balances.set(k, next);
    }
    if (internal(dest)) {
      const k = keyOf(l.product_id, dest.id);
      balances.set(k, balances.get(k)!.plus(qty));
    }
    posted.set(l.id, qty);
    moves.push({ lineId: l.id, productId: p.id, from: source.id, to: dest.id, qty });
  }

  if (changed.length > 0) {
    throw new AppError(
      'BALANCE_CHANGED',
      `Stock moved since counting on ${changed.length} line${changed.length > 1 ? 's' : ''}. Re-count, or confirm to post the count against the current balance.`,
      changed,
    );
  }
  if (shorts.length > 0) {
    const first = shorts[0]!;
    throw new AppError(
      'INSUFFICIENT_STOCK',
      `Can't validate ${op.reference}: ${first.productName} needs ${trim(first.requested)} at ${first.locationName}, only ${trim(first.available)} available` +
        (shorts.length > 1 ? ` (and ${shorts.length - 1} more line${shorts.length > 2 ? 's' : ''})` : '') +
        '. Receive more stock or reduce the quantity.',
      shorts,
    );
  }

  // Write: balances, then the ledger, then the document.
  for (const k of keys) {
    await tx.$executeRaw`
      UPDATE stock_quant SET quantity = ${balances.get(keyOf(k.productId, k.locationId))!}, updated_at = now()
      WHERE product_id = ${k.productId}::uuid AND location_id = ${k.locationId}::uuid`;
  }
  const doneAt = opts.doneAt ?? new Date();
  if (moves.length > 0) {
    await tx.stockMove.createMany({
      data: moves.map((m) => ({
        operationId: op.id,
        operationLineId: m.lineId,
        productId: m.productId,
        fromLocationId: m.from,
        toLocationId: m.to,
        quantity: m.qty,
        doneAt,
        doneById: actor.id,
      })),
    });
  }
  for (const [lineId, qty] of posted) {
    await tx.operationLine.update({ where: { id: lineId }, data: { postedQuantity: qty } });
  }
  await tx.operation.update({
    where: { id: op.id },
    data: { status: 'DONE', validatedById: actor.id, validatedAt: doneAt, version: { increment: 1 } },
  });

  const warehouseIds = [source.warehouse_id, dest.warehouse_id].filter((w): w is string => w !== null);
  return {
    movesPosted: moves.length,
    unchangedLines,
    productIds: [...products.keys()],
    warehouseIds: [...new Set(warehouseIds)],
  };
}

/**
 * Creates any missing balance rows at 0, then locks every key in one sorted statement. Creating
 * first matters: FOR UPDATE on a row that doesn't exist yet locks nothing, so a first count
 * racing a first receipt could otherwise both start from 0.
 */
async function lockBalances(
  tx: Tx,
  keys: Array<{ productId: string; locationId: string }>,
): Promise<Map<string, Prisma.Decimal>> {
  const out = new Map<string, Prisma.Decimal>();
  if (keys.length === 0) return out;
  const tuples = Prisma.join(keys.map((k) => Prisma.sql`(${k.productId}::uuid, ${k.locationId}::uuid)`));
  await tx.$executeRaw`
    INSERT INTO stock_quant (product_id, location_id, quantity, updated_at)
    SELECT v.p, v.l, 0, now() FROM (VALUES ${tuples}) AS v(p, l)
    ON CONFLICT DO NOTHING`;
  const rows = await tx.$queryRaw<Array<{ product_id: string; location_id: string; quantity: Prisma.Decimal }>>`
    SELECT product_id::text, location_id::text, quantity FROM stock_quant
    WHERE (product_id, location_id) IN (${tuples})
    ORDER BY product_id, location_id FOR UPDATE`;
  for (const r of rows) out.set(keyOf(r.product_id, r.location_id), new Prisma.Decimal(r.quantity));
  for (const k of keys) if (!out.has(keyOf(k.productId, k.locationId))) out.set(keyOf(k.productId, k.locationId), ZERO);
  return out;
}

/** Postgres orders uuids by bytes, which matches comparing their lower-case hex strings. */
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function trim(q: string): string {
  return q.replace(/\.?0+$/, '');
}
