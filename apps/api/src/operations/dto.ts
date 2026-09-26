import { OUTGOING_TYPES, type OperationStatus, type OperationType, type Uom } from '@stocksense/shared';
import { Prisma } from '@prisma/client';
import type { Tx } from '../lib/db';
import { prisma } from '../lib/db';
import { AppError } from '../lib/errors';
import { isLate } from '../lib/time';
import { balancesAt } from '../inventory/references';

const q = (d: Prisma.Decimal | null | undefined) => (d == null ? null : new Prisma.Decimal(d).toFixed(3));

export interface OperationLineDto {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  uom: Uom;
  productActive: boolean;
  quantity: string | null;
  countedQuantity: string | null;
  balanceAtCount: string | null;
  postedQuantity: string | null;
  /** Current balance at the internal end that the line draws from (source for outgoing, counted location for adjustments). */
  onHand: string | null;
  /** Outgoing lines only, before Done: how much is missing at the source. The form shows these red. */
  shortBy: string | null;
}

export interface OperationDto {
  id: string;
  reference: string;
  type: OperationType;
  status: OperationStatus;
  version: number;
  warehouseId: string;
  source: { id: string; label: string; type: string };
  dest: { id: string; label: string; type: string };
  partner: { id: string; name: string } | null;
  responsible: { id: string; name: string } | null;
  scheduledDate: string | null;
  isLate: boolean;
  pickedAt: string | null;
  packedAt: string | null;
  notes: string | null;
  createdBy: { id: string; name: string };
  validatedBy: { id: string; name: string } | null;
  validatedAt: string | null;
  canceledBy: { id: string; name: string } | null;
  canceledAt: string | null;
  createdAt: string;
  lines: OperationLineDto[];
}

const include = {
  lines: { include: { product: true }, orderBy: { product: { sku: 'asc' } } },
  sourceLocation: { include: { warehouse: true } },
  destLocation: { include: { warehouse: true } },
  partner: true,
  responsible: true,
  createdBy: true,
  validatedBy: true,
  canceledBy: true,
} satisfies Prisma.OperationInclude;

type Loc = Prisma.LocationGetPayload<{ include: { warehouse: true } }>;
const label = (l: Loc) => (l.warehouse ? `${l.warehouse.code}/${l.name}` : l.name);
const person = (u: { id: string; name: string } | null) => (u ? { id: u.id, name: u.name } : null);
const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** The document with each line's current balance, so the form can mark short lines red. */
export async function getOperation(id: string, db: Tx = prisma): Promise<OperationDto> {
  const op = await db.operation.findUnique({ where: { id }, include });
  if (!op) throw new AppError('NOT_FOUND', 'Operation not found');

  const productIds = op.lines.map((l) => l.productId);
  const outgoing = OUTGOING_TYPES.includes(op.type);
  const balanceLocation = outgoing ? op.sourceLocationId : op.type === 'ADJUSTMENT' ? op.destLocationId : null;
  const balances = balanceLocation ? await balancesAt(db, balanceLocation, productIds) : null;
  const open = op.status !== 'DONE' && op.status !== 'CANCELED';

  return {
    id: op.id,
    reference: op.reference,
    type: op.type,
    status: op.status,
    version: op.version,
    warehouseId: op.warehouseId,
    source: { id: op.sourceLocation.id, label: label(op.sourceLocation), type: op.sourceLocation.type },
    dest: { id: op.destLocation.id, label: label(op.destLocation), type: op.destLocation.type },
    partner: op.partner ? { id: op.partner.id, name: op.partner.name } : null,
    responsible: person(op.responsible),
    scheduledDate: iso(op.scheduledDate),
    isLate: isLate(op.scheduledDate, op.status),
    pickedAt: iso(op.pickedAt),
    packedAt: iso(op.packedAt),
    notes: op.notes,
    createdBy: person(op.createdBy)!,
    validatedBy: person(op.validatedBy),
    validatedAt: iso(op.validatedAt),
    canceledBy: person(op.canceledBy),
    canceledAt: iso(op.canceledAt),
    createdAt: op.createdAt.toISOString(),
    lines: op.lines.map((l) => {
      const onHand = balances?.get(l.productId) ?? null;
      let shortBy: string | null = null;
      if (outgoing && open && onHand && l.quantity && onHand.lessThan(l.quantity)) {
        shortBy = new Prisma.Decimal(l.quantity).minus(onHand).toFixed(3);
      }
      return {
        id: l.id,
        productId: l.productId,
        sku: l.product.sku,
        productName: l.product.name,
        uom: l.product.uom,
        productActive: l.product.isActive,
        quantity: q(l.quantity),
        countedQuantity: q(l.countedQuantity),
        balanceAtCount: q(l.balanceAtCount),
        postedQuantity: q(l.postedQuantity),
        onHand: q(onHand),
        shortBy,
      };
    }),
  };
}
