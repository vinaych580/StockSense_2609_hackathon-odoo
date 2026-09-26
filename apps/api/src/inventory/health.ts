/**
 * Stock health: the one definition of in stock / low / out, used by the dashboard KPIs, the
 * low-stock list and badge, and GET /products?stockStatus=. There is no other alert logic.
 *
 *   On hand   summed over internal locations within the warehouse filter (all warehouses by default)
 *   Out       an active product with on hand = 0
 *   Low       not out, and a reorder rule (in scope) whose warehouse holds ≤ its min_qty. Once per product.
 *   In stock  on hand > 0 (low products are in stock too)
 *
 * Out of stock with a warehouse filter: a product counts only if that warehouse carries it, i.e. it
 * has a reorder rule there or has ever held stock there. Otherwise WH2's filter would report nearly
 * every product WH2 never stocks as "out". Without a filter, every active product counts.
 */
import type { LowStockRuleDto, StockStatus, Uom } from '@stocksense/shared';
import { Prisma } from '@prisma/client';
import { prisma, type Tx } from '../lib/db';

export interface HealthScope {
  warehouseId?: string;
  categoryId?: string;
  /** Limit to these products (a product list page). */
  productIds?: string[];
}

export interface HealthRow {
  productId: string;
  sku: string;
  name: string;
  uom: Uom;
  categoryId: string | null;
  categoryName: string | null;
  onHand: Prisma.Decimal;
  status: StockStatus;
  lowRules: LowStockRuleDto[];
}

interface RawRow {
  product_id: string;
  sku: string;
  name: string;
  uom: Uom;
  category_id: string | null;
  category_name: string | null;
  on_hand: Prisma.Decimal;
  low_rules: Array<{ warehouse_id: string; warehouse_code: string; on_hand: string; min_qty: string; max_qty: string }> | null;
}

const q3 = (d: Prisma.Decimal.Value) => new Prisma.Decimal(d).toFixed(3);

/** Health of every active product in scope. Archived products, and products the filtered warehouse doesn't carry, are left out. */
export async function stockHealth(scope: HealthScope = {}, db: Tx | typeof prisma = prisma): Promise<HealthRow[]> {
  const wh = scope.warehouseId ?? null;
  const productFilters: Prisma.Sql[] = [Prisma.sql`p.is_active`];
  if (scope.categoryId) productFilters.push(Prisma.sql`p.category_id = ${scope.categoryId}::uuid`);
  if (scope.productIds) productFilters.push(Prisma.sql`p.id = ANY(${scope.productIds}::uuid[])`);
  if (wh) {
    productFilters.push(Prisma.sql`(
      EXISTS (SELECT 1 FROM reorder_rule r WHERE r.product_id = p.id AND r.warehouse_id = ${wh}::uuid)
      OR EXISTS (SELECT 1 FROM stock_quant q JOIN location l ON l.id = q.location_id
                 WHERE q.product_id = p.id AND l.warehouse_id = ${wh}::uuid))`);
  }

  const rows = await db.$queryRaw<RawRow[]>`
    WITH per_wh AS (
      SELECT q.product_id, l.warehouse_id, SUM(q.quantity) AS qty
      FROM stock_quant q JOIN location l ON l.id = q.location_id
      WHERE l.type = 'INTERNAL' AND (${wh}::uuid IS NULL OR l.warehouse_id = ${wh}::uuid)
      GROUP BY q.product_id, l.warehouse_id
    ), total AS (
      SELECT product_id, SUM(qty) AS qty FROM per_wh GROUP BY product_id
    ), low AS (
      SELECT r.product_id,
             json_agg(json_build_object(
               'warehouse_id', w.id, 'warehouse_code', w.code,
               'on_hand', COALESCE(o.qty, 0)::text, 'min_qty', r.min_qty::text, 'max_qty', r.max_qty::text
             ) ORDER BY w.code) AS rules
      FROM reorder_rule r
      JOIN warehouse w ON w.id = r.warehouse_id AND w.is_active
      LEFT JOIN per_wh o ON o.product_id = r.product_id AND o.warehouse_id = r.warehouse_id
      WHERE (${wh}::uuid IS NULL OR r.warehouse_id = ${wh}::uuid) AND COALESCE(o.qty, 0) <= r.min_qty
      GROUP BY r.product_id
    )
    SELECT p.id::text AS product_id, p.sku, p.name, p.uom::text AS uom,
           c.id::text AS category_id, c.name AS category_name,
           COALESCE(t.qty, 0) AS on_hand, low.rules AS low_rules
    FROM product p
    LEFT JOIN category c ON c.id = p.category_id
    LEFT JOIN total t ON t.product_id = p.id
    LEFT JOIN low ON low.product_id = p.id
    WHERE ${Prisma.join(productFilters, ' AND ')}
    ORDER BY p.sku`;

  return rows.map((r) => {
    const onHand = new Prisma.Decimal(r.on_hand);
    const status: StockStatus = onHand.lte(0) ? 'out' : r.low_rules?.length ? 'low' : 'ok';
    return {
      productId: r.product_id,
      sku: r.sku,
      name: r.name,
      uom: r.uom,
      categoryId: r.category_id,
      categoryName: r.category_name,
      onHand,
      status,
      lowRules: (r.low_rules ?? []).map((x) => {
        const suggested = new Prisma.Decimal(x.max_qty).minus(x.on_hand);
        return {
          warehouseId: x.warehouse_id,
          warehouseCode: x.warehouse_code,
          onHand: q3(x.on_hand),
          minQty: q3(x.min_qty),
          maxQty: q3(x.max_qty),
          suggestedQty: q3(suggested.isNegative() ? 0 : suggested),
        };
      }),
    };
  });
}
