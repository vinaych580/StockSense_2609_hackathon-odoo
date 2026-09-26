import {
  LOCATION_RULES,
  type LocationType,
  type OperationType,
  type Uom,
} from '@stocksense/shared';
import { Prisma } from '@prisma/client';
import type { Tx } from '../lib/db';
import { AppError } from '../lib/errors';

export interface ProductRef {
  id: string;
  sku: string;
  name: string;
  uom: Uom;
  is_active: boolean;
}

export interface LocationRef {
  id: string;
  type: LocationType;
  is_active: boolean;
  warehouse_id: string | null;
  /** Display name such as "WH1/Stock", or "Vendors" for virtual locations. */
  label: string;
}

/**
 * Reads the document's products FOR SHARE (sorted by id) and its two locations FOR SHARE, and
 * checks they are active and suit the type. FOR SHARE makes an archive (which takes FOR UPDATE)
 * run strictly before or after us: we either see the product active or fail with INACTIVE_REFERENCE.
 */
export async function lockReferences(
  tx: Tx,
  type: OperationType,
  sourceLocationId: string,
  destLocationId: string,
  productIds: string[],
): Promise<{ products: Map<string, ProductRef>; source: LocationRef; dest: LocationRef }> {
  const products = new Map<string, ProductRef>();
  if (productIds.length > 0) {
    const rows = await tx.$queryRaw<ProductRef[]>`
      SELECT id::text, sku, name, uom::text AS uom, is_active
      FROM product WHERE id = ANY(${productIds}::uuid[])
      ORDER BY id FOR SHARE`;
    for (const r of rows) products.set(r.id, r);
  }
  for (const id of productIds) {
    const p = products.get(id);
    if (!p) throw new AppError('INACTIVE_REFERENCE', 'A line refers to a product that does not exist', { productId: id });
    if (!p.is_active)
      throw new AppError('INACTIVE_REFERENCE', `${p.name} (${p.sku}) is archived. Remove the line or restore the product.`, {
        productId: p.id,
      });
  }

  // A location in an archived warehouse reads as archived. Only the location rows are locked; archiving
  // a warehouse must lock its locations FOR UPDATE, so it runs strictly before or after this.
  const locs = await tx.$queryRaw<LocationRef[]>`
    SELECT l.id::text, l.type::text AS type, (l.is_active AND COALESCE(w.is_active, true)) AS is_active,
           l.warehouse_id::text AS warehouse_id,
           CASE WHEN w.code IS NULL THEN l.name ELSE w.code || '/' || l.name END AS label
    FROM location l LEFT JOIN warehouse w ON w.id = l.warehouse_id
    WHERE l.id = ANY(${[sourceLocationId, destLocationId]}::uuid[])
    ORDER BY l.id FOR SHARE OF l`;
  const source = locs.find((l) => l.id === sourceLocationId);
  const dest = locs.find((l) => l.id === destLocationId);
  checkLocation(type, 'source', source);
  checkLocation(type, 'dest', dest);
  return { products, source: source!, dest: dest! };
}

export function checkLocation(
  type: OperationType,
  end: 'source' | 'dest',
  loc: Pick<LocationRef, 'type' | 'is_active' | 'label'> | undefined,
): void {
  const word = end === 'source' ? 'source' : 'destination';
  if (!loc) throw new AppError('INACTIVE_REFERENCE', `The ${word} location does not exist`);
  if (!loc.is_active) throw new AppError('INACTIVE_REFERENCE', `${loc.label} is archived`);
  const wanted = LOCATION_RULES[type][end];
  if (loc.type !== wanted) {
    const noun = type.charAt(0) + type.slice(1).toLowerCase();
    throw new AppError(
      'INVALID_LOCATION_FOR_TYPE',
      `${noun}s need ${wanted === 'INTERNAL' ? 'an internal' : `the ${wanted.toLowerCase()}`} ${word} location, not ${loc.label}`,
      { end, expected: wanted, actual: loc.type },
    );
  }
}

/** Current balances of some products at one location, without locking. Missing rows read as 0. */
export async function balancesAt(
  db: Tx | Prisma.TransactionClient,
  locationId: string,
  productIds: string[],
): Promise<Map<string, Prisma.Decimal>> {
  const out = new Map<string, Prisma.Decimal>(productIds.map((id) => [id, new Prisma.Decimal(0)]));
  if (productIds.length === 0) return out;
  const rows = await db.$queryRaw<Array<{ product_id: string; quantity: Prisma.Decimal }>>`
    SELECT product_id::text, quantity FROM stock_quant
    WHERE location_id = ${locationId}::uuid AND product_id = ANY(${productIds}::uuid[])`;
  for (const r of rows) out.set(r.product_id, new Prisma.Decimal(r.quantity));
  return out;
}
