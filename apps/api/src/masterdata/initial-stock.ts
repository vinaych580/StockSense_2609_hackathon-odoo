/**
 * Initial stock for new products. It never inserts balances directly: each location gets one
 * inventory adjustment (Draft → validate) inside the caller's transaction, so the quantities land
 * in the ledger with a reference like any other stock.
 */
import { SYSTEM_LOCATION_IDS } from '@stocksense/shared';
import type { Tx, TxContext } from '../lib/db';
import type { Actor } from '../inventory/posting';
import { createInTx, runActionInTx } from '../operations/service';

export interface InitialStockLine {
  productId: string;
  locationId: string;
  quantity: string;
}

/** Operation lines per document, matching the create schema's limit. */
const CHUNK = 200;

/** Posts the lines and returns the references of the adjustments it validated. Zero quantities are skipped. */
export async function postInitialStock(tx: Tx, ctx: TxContext, actor: Actor, lines: InitialStockLine[]): Promise<string[]> {
  const byLocation = new Map<string, InitialStockLine[]>();
  for (const l of lines) {
    if (Number(l.quantity) === 0) continue;
    byLocation.set(l.locationId, [...(byLocation.get(l.locationId) ?? []), l]);
  }

  const references: string[] = [];
  for (const [locationId, all] of byLocation) {
    for (let i = 0; i < all.length; i += CHUNK) {
      const id = await createInTx(tx, actor, {
        type: 'ADJUSTMENT',
        sourceLocationId: SYSTEM_LOCATION_IDS.ADJUSTMENT,
        destLocationId: locationId,
        notes: 'Initial stock',
        lines: all.slice(i, i + CHUNK).map((l) => ({ productId: l.productId, countedQuantity: l.quantity })),
      });
      await runActionInTx(tx, ctx, actor, id, 'validate', { version: 0 });
      const op = await tx.operation.findUniqueOrThrow({ where: { id }, select: { reference: true } });
      references.push(op.reference);
    }
  }
  return references;
}
